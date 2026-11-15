import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SocialSession, useSocialSession } from "./session";

const mocks = vi.hoisted(() => ({
  identity: { isConnected: true, walletAddress: "G-wallet", walletType: "external_wallet" },
  authenticate: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/core/wallet/hooks/use-highrable-wallet-identity", () => ({
  useHighrableWalletIdentity: () => mocks.identity,
}));
vi.mock("@/core/wallet/hooks/use-wallet", () => ({
  useWallet: () => ({ authenticateWallet: mocks.authenticate }),
}));
vi.mock("convex/react", () => ({ useQuery: () => ({ _id: "viewer" }) }));
function Consumer() {
  return <output data-testid="token">{useSocialSession().token}</output>;
}
function App() {
  return (
    <StrictMode>
      <SocialSession>
        <Consumer />
      </SocialSession>
    </StrictMode>
  );
}
const response = (token = "verified") => ({
  ok: true,
  json: async () => ({ token, expiresAt: Date.now() + 900_000 }),
});
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.identity = { isConnected: true, walletAddress: "G-wallet", walletType: "external_wallet" };
  mocks.fetch.mockReset().mockResolvedValue(response());
  mocks.authenticate.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("automatically reuses the verified wallet session once even in Strict Mode", async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("verified"));
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.authenticate).not.toHaveBeenCalled();
  expect(screen.queryByRole("button")).toBeNull();
});
it("authenticates only if the existing server session is unavailable", async () => {
  mocks.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Expired" }) });
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("verified"));
  expect(mocks.authenticate).toHaveBeenCalledTimes(1);
});
it("does not loop on failure and allows an explicit retry", async () => {
  mocks.fetch.mockRejectedValue(new Error("Offline"));
  render(<App />);
  await screen.findByRole("alert");
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  mocks.fetch.mockResolvedValue(response());
  fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("verified"));
});
it("ignores a verification response after disconnect", async () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  mocks.fetch.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(<App />);
  mocks.identity = { ...mocks.identity, isConnected: false };
  view.rerender(<App />);
  resolve(response("stale"));
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe(""));
  expect(screen.getByText("Connect your wallet to post, react, and comment.")).toBeTruthy();
});
it("clears the previous token when switching wallets", async () => {
  const view = render(<App />);
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("verified"));
  mocks.fetch.mockResolvedValue(response("second-wallet"));
  mocks.identity = { ...mocks.identity, walletAddress: "G-other" };
  view.rerender(<App />);
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("second-wallet"));
  expect(JSON.parse(mocks.fetch.mock.calls[1]![1].body).address).toBe("G-other");
});
