import {
  Address,
  Contract,
  hash,
  nativeToScVal,
  Networks,
  rpc,
  SorobanDataBuilder,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  connectFreshPasskeySmartAccount,
  ensureConnectedPasskeyWalletShape,
  getSmartAccountKit,
  resetSmartAccountKit,
} from "./smart-account-kit";

const config = vi.hoisted(() => ({
  rpcUrl: "https://rpc.example",
  networkPassphrase: "Test SDF Network ; September 2015",
  accountWasmHash: "01".repeat(32),
  webauthnVerifierAddress: "",
  rpId: "localhost",
  rpName: "Highrable",
  relayerUrl: null,
}));

vi.mock("./smart-account-config", () => ({
  getSmartAccountConfigOrThrow: () => config,
}));

const credentialId = Buffer.from([1, 2, 3, 4]).toString("base64url");
const verifier = StrKey.encodeContract(Buffer.alloc(32, 3));
const preferredContractId = StrKey.encodeContract(Buffer.alloc(32, 2));
config.webauthnVerifierAddress = verifier;

function derivedAccount(deployerPublicKey: string): string {
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId: hash(Buffer.from(Networks.TESTNET)),
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: Address.fromString(deployerPublicKey).toScAddress(),
          salt: hash(Buffer.from(credentialId, "base64url")),
        }),
      ),
    }),
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

function mockChain(
  contractId: string,
  options: {
    signerCredentialId?: string;
    signerVerifier?: string;
    validUntil?: number;
    wasmHash?: string;
  } = {},
) {
  const key = new Contract(contractId).getFootprint();
  const val = xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: new xdr.ExtensionPoint(0),
      contract: key.contractData().contract(),
      durability: key.contractData().durability(),
      key: key.contractData().key(),
      val: xdr.ScVal.scvContractInstance(
        new xdr.ScContractInstance({
          executable: xdr.ContractExecutable.contractExecutableWasm(
            Buffer.from(options.wasmHash ?? config.accountWasmHash, "hex"),
          ),
          storage: null,
        }),
      ),
    }),
  );
  const instance = { key, val };
  vi.spyOn(rpc.Server.prototype, "getContractData").mockResolvedValue(instance);
  vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValue({
    entries: [instance],
    latestLedger: 123,
  });
  const keyData = Buffer.concat([
    Buffer.alloc(65, 4),
    Buffer.from(options.signerCredentialId ?? credentialId, "base64url"),
  ]);
  return vi.spyOn(rpc.Server.prototype, "simulateTransaction").mockResolvedValue({
    id: "1",
    latestLedger: 123,
    events: [],
    _parsed: true,
    minResourceFee: "100",
    transactionData: new SorobanDataBuilder(),
    result: {
      auth: [],
      retval: nativeToScVal({
        context_type: ["Default"],
        id: xdr.ScVal.scvU32(0),
        policies: [],
        signers: [["External", options.signerVerifier ?? verifier, keyData]],
        valid_until: options.validUntil === undefined ? null : xdr.ScVal.scvU32(options.validUntil),
      }),
    },
  });
}

function mockAuthentication() {
  const kit = getSmartAccountKit();
  const authenticate = vi.spyOn(kit, "authenticatePasskey").mockResolvedValue({
    credentialId,
    rawResponse: {
      id: credentialId,
      rawId: credentialId,
      type: "public-key",
      clientExtensionResults: {},
      response: { clientDataJSON: "", authenticatorData: "", signature: "" },
    },
  });
  return { kit, authenticate };
}

function mockIndexer(lookup: number, details: number) {
  const fetch = vi.fn(async (url: string) =>
    url.includes("/api/lookup/")
      ? Response.json({ contracts: [{ contract_id: preferredContractId }] }, { status: lookup })
      : Response.json(
          {
            summary: { contract_id: preferredContractId },
            contextRules: [
              {
                signers: [
                  {
                    credential_id: Buffer.from(credentialId, "base64url").toString("hex"),
                    signer_type: "External",
                    signer_address: verifier,
                  },
                ],
              },
            ],
          },
          { status: details },
        ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

afterEach(async () => {
  await resetSmartAccountKit();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("reconnects a derived account through Stellar RPC when credential discovery returns HTTP 500", async () => {
  const { kit, authenticate } = mockAuthentication();
  const contractId = derivedAccount(kit.deployerPublicKey);
  const simulate = mockChain(contractId);
  const fetch = mockIndexer(500, 500);

  await expect(connectFreshPasskeySmartAccount()).resolves.toMatchObject({
    contractId,
    credentialId,
  });
  expect(kit.contractId).toBe(contractId);
  expect(simulate).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
  expect(authenticate).toHaveBeenCalledOnce();
});

it.each([200, 500])(
  "reconnects the preferred account with discovery status %i and signer details unavailable",
  async (lookupStatus) => {
    mockAuthentication();
    const simulate = mockChain(preferredContractId);
    const fetch = mockIndexer(lookupStatus, 500);

    await expect(connectFreshPasskeySmartAccount({ preferredContractId })).resolves.toMatchObject({
      contractId: preferredContractId,
      credentialId,
    });
    expect(fetch).toHaveBeenCalledTimes(lookupStatus === 200 ? 2 : 1);
    expect(simulate).toHaveBeenCalledOnce();
  },
);

it("preserves a saved account during an indexer outage without prompting again", async () => {
  const { kit, authenticate } = mockAuthentication();
  const simulate = mockChain(preferredContractId);
  mockIndexer(200, 200);

  await expect(connectFreshPasskeySmartAccount()).resolves.toMatchObject({
    contractId: preferredContractId,
    credentialId,
  });
  expect(simulate).not.toHaveBeenCalled();

  const fetch = mockIndexer(500, 500);
  const restored = await kit.connectWallet();
  expect(restored).toMatchObject({ contractId: preferredContractId, credentialId });
  await expect(
    ensureConnectedPasskeyWalletShape({ kit, contractId: preferredContractId, credentialId }),
  ).resolves.toBeUndefined();
  expect(authenticate).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
  expect(simulate).toHaveBeenCalledOnce();
});

it("fails safely when the indexer is down and RPC cannot locate an account", async () => {
  const { kit } = mockAuthentication();
  mockIndexer(500, 500);
  vi.spyOn(rpc.Server.prototype, "getContractData").mockRejectedValue(new Error("Missing data"));

  await expect(connectFreshPasskeySmartAccount()).rejects.toThrow("RPC could not locate");
  expect(kit.isConnected).toBe(false);
  await expect(kit.connectWallet()).resolves.toBeNull();
});

it("rejects an HTTP 400 discovery response without falling back", async () => {
  mockAuthentication();
  const simulate = mockChain(preferredContractId);
  mockIndexer(400, 200);

  await expect(connectFreshPasskeySmartAccount({ preferredContractId })).rejects.toThrow(
    "Indexer request failed: 400",
  );
  expect(simulate).not.toHaveBeenCalled();
});

it.each([
  { signerCredentialId: "AAECAwQ", error: "not an active signer" },
  {
    signerVerifier: StrKey.encodeContract(Buffer.alloc(32, 5)),
    error: "instead of the configured verifier",
  },
  { validUntil: 122, error: "expired" },
  { wasmHash: "02".repeat(32), error: "could not verify" },
])("rejects unsafe fallback signer or account data ($error)", async ({ error, ...options }) => {
  const { kit } = mockAuthentication();
  mockChain(preferredContractId, options);
  mockIndexer(500, 404);

  await expect(connectFreshPasskeySmartAccount({ preferredContractId })).rejects.toThrow(error);
  expect(kit.isConnected).toBe(false);
  await expect(kit.connectWallet()).resolves.toBeNull();
});
