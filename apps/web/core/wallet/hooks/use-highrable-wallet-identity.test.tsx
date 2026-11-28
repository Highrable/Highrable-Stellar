// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";

import { useHighrableWalletIdentity } from "./use-highrable-wallet-identity";

vi.mock("./use-wallet", () => ({
  useWallet: () => ({ address: "G-external", isConnected: true }),
}));
vi.mock("@/core/wallet/passkey-smart-account-context", () => ({
  usePasskeySmartAccount: () => {
    const [activeWalletMode, setActiveWalletMode] = useState("external_wallet");
    return {
      activeWalletMode,
      isPasskeyConnected: true,
      smartAccountAddress: "C-passkey",
      setActiveWalletMode,
    };
  },
}));

it("preserves the selected external wallet when a new reader mounts with both wallets connected", () => {
  const { result, unmount } = renderHook(useHighrableWalletIdentity);

  expect(result.current).toMatchObject({
    walletAddress: "G-external",
    walletType: "external_wallet",
    isConnected: true,
  });
  unmount();
});
