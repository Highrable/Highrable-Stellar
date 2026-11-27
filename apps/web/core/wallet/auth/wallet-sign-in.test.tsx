// @vitest-environment jsdom
import { WalletContextProvider, useWalletContext } from "@/core/wallet/context/wallet-context";
import {
  PasskeySmartAccountProvider,
  usePasskeySmartAccount,
} from "@/core/wallet/passkey-smart-account-context";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import React, { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  kit: { authenticatePasskey: vi.fn(), connectWallet: vi.fn(), createWallet: vi.fn() },
  discover: vi.fn(),
  connect: vi.fn(),
  persist: vi.fn(),
}));

vi.mock("@/core/config/env", () => ({ env: {} }));
vi.mock("@/core/passkeys/webauthn-support", () => ({ isWebAuthnSupported: () => true }));
vi.mock("@/core/stellar/mainnet-readiness", () => ({
  evaluateSmartAccountMainnetReadiness: () => ({ isMainnet: false }),
}));
vi.mock("@/core/stellar/smart-account-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/stellar/smart-account-config")>()),
  assertSmartAccountConfigCanDeployCompatibleAccount: () => undefined,
  hasSmartAccountConfig: () => true,
}));
vi.mock("@/core/stellar/smart-account-kit", () => ({
  ensureConnectedPasskeyWalletShape: vi.fn(),
  getSmartAccountKit: () => mocks.kit,
  connectPasskeySmartAccount: mocks.connect,
  discoverPasskeyContracts: mocks.discover,
  resetSmartAccountKit: vi.fn(),
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.persist }));

const account = {
  address: "G-wallet",
  displayAddress: "G-wallet",
  walletId: null,
  walletName: null,
  network: null,
  isTestnet: false,
};
const contract = { contractId: "C-wallet", credentialId: "Kg" };

function externalWallet(restore = false) {
  const walletClient = {
    connect: vi.fn(async () => account),
    restoreConnection: vi.fn(async () => (restore ? account : null)),
    signMessage: vi.fn(async () => "signed"),
    getActiveWallet: vi.fn(),
    getPublicKey: vi.fn(),
    getNetwork: vi.fn(),
    disconnect: vi.fn(),
    signTransaction: vi.fn(),
  };
  const walletAuthService = {
    createChallenge: vi.fn(async () => ({ message: "challenge", nonce: "nonce", expiresAt: "" })),
    verifySignature: vi.fn(async () => ({
      address: account.address,
      token: "wallet-session",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
  };
  const view = renderHook(useWalletContext, {
    wrapper: ({ children }) => (
      <StrictMode>
        <WalletContextProvider walletClient={walletClient} walletAuthService={walletAuthService}>
          {children}
        </WalletContextProvider>
      </StrictMode>
    ),
  });
  return { ...view, walletClient, walletAuthService };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("completes external wallet sign-in during connection and reuses its session", async () => {
  const { result, walletClient, walletAuthService } = externalWallet();
  await act(() => result.current.connectWallet());
  expect(result.current.authSession?.address).toBe(account.address);
  expect(walletAuthService.verifySignature).toHaveBeenCalledWith({
    address: account.address,
    message: "challenge",
    nonce: "nonce",
    signature: "signed",
  });
  await act(() => result.current.authenticateWallet());
  expect(walletClient.signMessage).toHaveBeenCalledOnce();
  expect(walletClient.signMessage).toHaveBeenCalledWith("challenge");
});

it("restores an external connection without requesting another signature", async () => {
  const { result, walletClient, walletAuthService } = externalWallet(true);
  await waitFor(() => expect(result.current.address).toBe(account.address));
  expect(walletClient.restoreConnection).toHaveBeenCalledOnce();
  expect(walletClient.signMessage).not.toHaveBeenCalled();
  expect(walletAuthService.createChallenge).not.toHaveBeenCalled();
});

it("keeps the wallet connection usable when the sign-in signature is declined", async () => {
  const { result, walletClient, walletAuthService } = externalWallet();
  walletClient.signMessage.mockRejectedValueOnce(new Error("Declined"));
  await act(() => result.current.connectWallet());
  expect(result.current.address).toBe(account.address);
  expect(result.current.authSession).toBeNull();
  expect(walletAuthService.verifySignature).not.toHaveBeenCalled();
});

it.each(["reconnect", "pick account", "create"])(
  "opens the verified browser session during passkey %s",
  async (mode) => {
    mocks.kit.connectWallet.mockResolvedValueOnce(null).mockResolvedValue(contract);
    mocks.kit.createWallet.mockResolvedValue({ ...contract, submitResult: { success: true } });
    mocks.discover.mockResolvedValue({
      contracts:
        mode === "pick account"
          ? [{ contract_id: "C-other" }, { contract_id: contract.contractId }]
          : [],
    });
    mocks.connect.mockResolvedValue(contract);
    const get = vi.fn(async (_options: CredentialRequestOptions) => ({
      rawId: new Uint8Array([42]).buffer,
      response: {
        clientDataJSON: new Uint8Array([1]).buffer,
        authenticatorData: new Uint8Array([2]).buffer,
        signature: new Uint8Array([3]).buffer,
      },
    }));
    vi.stubGlobal("navigator", { credentials: { get } });
    const fetchSession = vi.fn(async (_path: string, request: RequestInit) => {
      const body = JSON.parse(String(request.body));
      return {
        ok: true,
        json: async () =>
          body.action === "challenge"
            ? { challenge: "challenge", proof: "proof", rpId: "highrable.example" }
            : { token: "verified", expiresAt: Date.now() + 60_000 },
      };
    });
    vi.stubGlobal("fetch", fetchSession);
    const { result } = renderHook(usePasskeySmartAccount, { wrapper: PasskeySmartAccountProvider });
    await waitFor(() => expect(result.current.isRestoring).toBe(false));

    if (mode === "create") {
      await act(() => result.current.createPasskeyAccount());
    } else {
      await act(() => result.current.reconnectPasskeyAccount());
      if (mode === "pick account") {
        expect(result.current.smartAccountAddress).toBeNull();
        expect(fetchSession).toHaveBeenCalledOnce();
        await act(() => result.current.selectDiscoveredPasskeyContract(contract.contractId));
      }
    }

    expect(result.current.smartAccountAddress).toBe(contract.contractId);
    expect(result.current.webSessionRevision).toBe(1);
    expect(mocks.kit.authenticatePasskey).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledOnce();
    const publicKey = get.mock.lastCall?.[0]?.publicKey;
    expect(publicKey?.userVerification).toBe("required");
    expect(publicKey?.allowCredentials?.[0]?.id).toEqual(
      mode === "create" ? new Uint8Array([42]) : undefined,
    );
    const requests = fetchSession.mock.calls.map(([, input]) => JSON.parse(String(input.body)));
    expect(requests).toEqual([
      { action: "challenge", ...(mode === "create" ? { address: contract.contractId } : {}) },
      {
        action: "session",
        address: contract.contractId,
        proof: "proof",
        assertion: {
          credentialId: "Kg",
          clientDataJSON: "AQ",
          authenticatorData: "Ag",
          signature: "Aw",
        },
      },
    ]);
  },
);
