import {
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  SorobanDataBuilder,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";
import { afterEach, expect, it, vi } from "vitest";

import { readDefaultContextRule } from "./smart-account-context-rules";

const wasmHash = Buffer.alloc(32, 1);
const contractId = StrKey.encodeContract(Buffer.alloc(32, 2));
const verifier = StrKey.encodeContract(Buffer.alloc(32, 3));
const keyData = Buffer.alloc(68, 4);
const params = {
  contractId,
  expectedWasmHash: wasmHash.toString("hex"),
  networkPassphrase: Networks.TESTNET,
  rpcUrl: "https://rpc.example",
  sourceAccount: Keypair.random().publicKey(),
};

function mockContractInstance(hash: Buffer) {
  const key = new Contract(contractId).getFootprint();
  const val = xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: new xdr.ExtensionPoint(0),
      contract: key.contractData().contract(),
      durability: key.contractData().durability(),
      key: key.contractData().key(),
      val: xdr.ScVal.scvContractInstance(
        new xdr.ScContractInstance({
          executable: xdr.ContractExecutable.contractExecutableWasm(hash),
          storage: null,
        }),
      ),
    }),
  );
  vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockResolvedValue({
    entries: [{ key, val }],
    latestLedger: 123,
  });
}

function mockRule(policies: string[]) {
  const retval = nativeToScVal({
    context_type: ["Default"],
    id: xdr.ScVal.scvU32(0),
    policies,
    signers: [["External", verifier, keyData]],
    valid_until: null,
  });
  return vi.spyOn(rpc.Server.prototype, "simulateTransaction").mockResolvedValue({
    id: "1",
    latestLedger: 123,
    events: [],
    _parsed: true,
    minResourceFee: "100",
    transactionData: new SorobanDataBuilder(),
    result: { auth: [], retval },
  });
}

afterEach(() => vi.restoreAllMocks());

it("reads a policy-free default passkey rule from the configured smart-account WASM", async () => {
  mockContractInstance(wasmHash);
  mockRule([]);

  await expect(readDefaultContextRule(params)).resolves.toEqual({
    latestLedger: 123,
    valid_until: null,
    signer: { verifier, keyData },
  });
});

it("rejects a default rule with an additional policy", async () => {
  mockContractInstance(wasmHash);
  mockRule([contractId]);

  await expect(readDefaultContextRule(params)).resolves.toBeNull();
});

it("rejects an unexpected contract executable before reading the rule", async () => {
  mockContractInstance(Buffer.alloc(32, 5));
  const simulate = mockRule([]);

  await expect(readDefaultContextRule(params)).resolves.toBeNull();
  expect(simulate).not.toHaveBeenCalled();
});
