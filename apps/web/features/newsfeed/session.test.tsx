// @vitest-environment jsdom
import SocialLayout from "@/app/(social)/layout";
import SocialProfileRoute from "@/app/(social)/people/[profileId]/page";
import { OnboardingRouteGuard } from "@/features/onboarding/components/onboarding-route-guard";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SocialSession, SocialSessionStatus, useSocialSession } from "./session";

const mocks = vi.hoisted(() => ({
  identity: { isConnected: true, walletAddress: "G-wallet", walletType: "external_wallet" },
  authenticate: vi.fn(),
  fetch: vi.fn(),
  viewer: { _id: "viewer" } as { _id: string } | null | undefined,
  onboarding: { isComplete: true } as { isComplete: boolean } | undefined,
  pathname: "/newsfeed",
  router: { replace: vi.fn() },
  client: { mutation: vi.fn() },
  profile: {
    id: "another-member",
    details: {
      name: "Another member",
      skills: [],
      links: [],
      workHistory: [],
      certificates: [],
      portfolio: [],
    },
  },
}));
vi.mock("@/core/wallet/hooks/use-highrable-wallet-identity", () => ({
  useHighrableWalletIdentity: () => mocks.identity,
}));
vi.mock("@/core/wallet/hooks/use-wallet", () => ({
  useWallet: () => ({ authenticateWallet: mocks.authenticate }),
}));
vi.mock("convex/react", () => ({
  useConvex: () => mocks.client,
  useQuery: (_query: unknown, args: { profileId?: string; walletAddress?: string } | "skip") => {
    if (args !== "skip" && args.profileId) return mocks.profile;
    if (args !== "skip" && args.walletAddress) return mocks.onboarding;
    return mocks.viewer;
  },
  useMutation: () => vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}));
vi.mock("@/core/wallet/components/wallet-status-card", () => ({
  WalletStatusCard: () => null,
}));
vi.mock("@/features/mode", () => ({ ModeSwitchCard: () => null }));
vi.mock("./follow-button", () => ({ FollowButton: () => null }));
vi.mock("./feed", () => ({ Feed: () => <Consumer /> }));
vi.mock("./image-editor", () => ({ ImageEditor: () => null }));
function Consumer() {
  return <output data-testid="token">{useSocialSession().token}</output>;
}
function App() {
  return (
    <StrictMode>
      <SocialSession>
        <SocialSessionStatus />
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
  mocks.viewer = { _id: "viewer" };
  mocks.onboarding = { isComplete: true };
  mocks.pathname = "/newsfeed";
  mocks.router.replace.mockReset();
  mocks.client.mutation.mockReset().mockResolvedValue("viewer");
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
it("creates a missing profile once after the route returns a session", async () => {
  mocks.viewer = null;
  const view = render(<App />);
  await waitFor(() => expect(mocks.client.mutation).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("token").textContent).toBe("verified");
  expect(screen.getByText("Setting up your newsfeed profile…")).toBeTruthy();
  mocks.viewer = { _id: "viewer" };
  view.rerender(<App />);
  expect(screen.queryByText("Setting up your newsfeed profile…")).toBeNull();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it("retries profile creation without requesting another wallet session", async () => {
  mocks.viewer = null;
  mocks.client.mutation.mockRejectedValueOnce(new Error("Profile setup failed"));
  render(<App />);
  await screen.findByText("Profile setup failed");
  mocks.client.mutation.mockResolvedValue("viewer");
  fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
  await waitFor(() => expect(mocks.client.mutation).toHaveBeenCalledTimes(2));
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it.each([undefined, { isComplete: false }])(
  "keeps the verified passkey session during profile navigation with onboarding state %j",
  async (onboarding) => {
    mocks.onboarding = onboarding;
    mocks.identity = {
      isConnected: true,
      walletAddress: "C-wallet",
      walletType: "passkey_smart_account",
    };
    const getCredential = vi.fn(async () => ({
      rawId: new ArrayBuffer(1),
      response: {
        clientDataJSON: new ArrayBuffer(1),
        authenticatorData: new ArrayBuffer(1),
        signature: new ArrayBuffer(1),
      },
    }));
    vi.stubGlobal("navigator", { credentials: { get: getCredential } });
    mocks.fetch.mockImplementation(async (_url, options) =>
      JSON.parse(options.body).action === "challenge"
        ? { ok: true, json: async () => ({ challenge: "challenge", proof: "proof" }) }
        : response(),
    );
    const view = render(
      <OnboardingRouteGuard>
        <SocialLayout>
          <Consumer />
        </SocialLayout>
      </OnboardingRouteGuard>,
    );
    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("verified"));

    const profile = await SocialProfileRoute({
      params: Promise.resolve({ profileId: mocks.profile.id }),
    });
    mocks.pathname = `/people/${mocks.profile.id}`;
    view.rerender(
      <OnboardingRouteGuard>
        <SocialLayout>{profile}</SocialLayout>
      </OnboardingRouteGuard>,
    );

    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Another member" })).toBeTruthy();
    expect(screen.getByTestId("token").textContent).toBe("verified");
    expect(screen.queryByText("Connecting to the newsfeed…")).toBeNull();
    expect(getCredential).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  },
);

it("still redirects a connected wallet with incomplete onboarding away from protected routes", () => {
  mocks.onboarding = { isComplete: false };
  mocks.pathname = "/dashboard";
  render(
    <OnboardingRouteGuard>
      <p>Dashboard content</p>
    </OnboardingRouteGuard>,
  );

  expect(mocks.router.replace).toHaveBeenCalledWith("/onboarding?next=%2Fdashboard");
  expect(screen.queryByText("Dashboard content")).toBeNull();
});
