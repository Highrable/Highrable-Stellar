// @vitest-environment jsdom
import SocialLayout from "@/app/(social)/layout";
import SocialProfileRoute from "@/app/(social)/people/[profileId]/page";
import { MessagesPage } from "@/features/chat/messages-page";
import { OnboardingRouteGuard } from "@/features/onboarding/components/onboarding-route-guard";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  SocialSession,
  SocialSessionProvider,
  SocialSessionStatus,
  useSocialSession,
} from "./session";

const mocks = vi.hoisted(() => ({
  identity: { isConnected: true, walletAddress: "G-wallet", walletType: "external_wallet" },
  authenticate: vi.fn(),
  credentialId: "Kg",
  webSessionRevision: 0,
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
vi.mock("@/core/wallet/passkey-smart-account-context", () => ({
  usePasskeySmartAccount: () => ({
    credentialId: mocks.credentialId,
    webSessionRevision: mocks.webSessionRevision,
  }),
}));
vi.mock("convex/react", () => ({
  useConvex: () => mocks.client,
  useQuery: (
    _query: unknown,
    args: { profileId?: string; walletAddress?: string; sessionToken?: string } | "skip",
  ) => {
    if (args === "skip") return undefined;
    if (args.profileId) return mocks.profile;
    if (args.walletAddress) return mocks.onboarding;
    if (args.sessionToken) return [];
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
      <SocialSessionProvider>
        <SocialSession>
          <SocialSessionStatus />
          <Consumer />
        </SocialSession>
      </SocialSessionProvider>
    </StrictMode>
  );
}
const response = (token = "verified") => ({
  ok: true,
  json: async () => ({ token, expiresAt: Date.now() + 900_000 }),
});
const challengeResponse = {
  ok: true,
  json: async () => ({ challenge: "challenge", proof: "proof", rpId: "highrable.example" }),
};
function mockPasskeySession() {
  mocks.identity = {
    isConnected: true,
    walletAddress: "C-wallet",
    walletType: "passkey_smart_account",
  };
  const get = vi.fn(async () => ({
    rawId: new Uint8Array([42]).buffer,
    response: {
      clientDataJSON: new ArrayBuffer(1),
      authenticatorData: new ArrayBuffer(1),
      signature: new ArrayBuffer(1),
    },
  }));
  vi.stubGlobal("navigator", { credentials: { get } });
  mocks.fetch.mockImplementation(async (_url, options) => {
    const { action } = JSON.parse(options.body);
    if (action === "challenge") return challengeResponse;
    if (action === "resume") {
      return { ok: false, status: 401, json: async () => ({ error: "Verification required" }) };
    }
    return response();
  });
  return get;
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.identity = { isConnected: true, walletAddress: "G-wallet", walletType: "external_wallet" };
  mocks.credentialId = "Kg";
  mocks.webSessionRevision = 0;
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

it("prompts only from verification and lets a cancelled or timed-out assertion be retried", async () => {
  const get = mockPasskeySession();
  get.mockRejectedValueOnce(
    new DOMException("The operation either timed out or was not allowed.", "NotAllowedError"),
  );
  render(<App />);
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Verify passkey" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/cancelled or timed out/);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Verify passkey" }));
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("verified"));
  expect(get).toHaveBeenLastCalledWith(
    expect.objectContaining({
      publicKey: expect.objectContaining({
        rpId: "highrable.example",
        allowCredentials: [{ id: new Uint8Array([42]), type: "public-key" }],
        userVerification: "required",
      }),
    }),
  );
});
it("requests a wallet signature only after the user chooses to verify", async () => {
  mocks.fetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({ error: "Expired" }),
  });
  render(<App />);
  const button = await screen.findByRole("button", { name: "Verify wallet" });
  expect(mocks.authenticate).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("verified"));
  expect(mocks.authenticate).toHaveBeenCalledTimes(1);
});
it("does not loop on failure and allows an explicit retry", async () => {
  mocks.fetch.mockRejectedValue(new Error("Offline"));
  render(<App />);
  await screen.findByRole("alert");
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.authenticate).not.toHaveBeenCalled();
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
    const getCredential = mockPasskeySession();
    const view = render(
      <SocialSessionProvider>
        <OnboardingRouteGuard>
          <SocialLayout>
            <SocialSessionStatus />
            <Consumer />
          </SocialLayout>
        </OnboardingRouteGuard>
      </SocialSessionProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Verify passkey" }));
    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("verified"));

    const profile = await SocialProfileRoute({
      params: Promise.resolve({ profileId: mocks.profile.id }),
    });
    mocks.pathname = `/people/${mocks.profile.id}`;
    view.rerender(
      <SocialSessionProvider>
        <OnboardingRouteGuard>
          <SocialLayout>{profile}</SocialLayout>
        </OnboardingRouteGuard>
      </SocialSessionProvider>,
    );

    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Another member" })).toBeTruthy();
    expect(screen.getByTestId("token").textContent).toBe("verified");
    expect(screen.queryByText("Connecting to the newsfeed…")).toBeNull();
    expect(getCredential).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  },
);

it("reuses onboarding verification across Messages, Newsfeed and a public profile", async () => {
  const get = mockPasskeySession();
  const profile = await SocialProfileRoute({
    params: Promise.resolve({ profileId: mocks.profile.id }),
  });
  const view = render(
    <SocialSessionProvider>
      <SocialSession>
        <SocialSessionStatus />
        <Consumer />
      </SocialSession>
    </SocialSessionProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Verify passkey" }));
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("verified"));

  view.rerender(
    <SocialSessionProvider>
      <MessagesPage />
    </SocialSessionProvider>,
  );
  expect(await screen.findByText("No general chats yet")).toBeTruthy();
  view.rerender(
    <SocialSessionProvider>
      <main>Dashboard</main>
    </SocialSessionProvider>,
  );
  view.rerender(
    <SocialSessionProvider>
      <SocialLayout>
        <Consumer />
        {profile}
      </SocialLayout>
    </SocialSessionProvider>,
  );
  expect(screen.getByRole("heading", { name: "Another member" })).toBeTruthy();
  expect(screen.getAllByTestId("token").every((item) => item.textContent === "verified")).toBe(
    true,
  );
  expect(get).toHaveBeenCalledOnce();
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
  expect(mocks.authenticate).not.toHaveBeenCalled();
});

it("opens Messages after a fresh app mount using prior passkey verification", async () => {
  const get = mockPasskeySession();
  mocks.fetch.mockResolvedValue(response("restored"));
  render(
    <SocialSessionProvider>
      <MessagesPage />
    </SocialSessionProvider>,
  );
  expect(await screen.findByText("No general chats yet")).toBeTruthy();
  expect(get).not.toHaveBeenCalled();
  expect(mocks.authenticate).not.toHaveBeenCalled();
  expect(JSON.parse(mocks.fetch.mock.calls[0]![1].body)).toEqual({
    address: "C-wallet",
    action: "resume",
    credentialId: "Kg",
  });
});

it("silently checks for the session after the same passkey is reconnected", async () => {
  const get = mockPasskeySession();
  const view = render(<App />);
  await screen.findByRole("button", { name: "Verify passkey" });
  mocks.webSessionRevision += 1;
  mocks.fetch.mockResolvedValue(response("reconnected"));
  view.rerender(<App />);
  await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("reconnected"));
  expect(get).not.toHaveBeenCalled();
});

it("ignores a late passkey challenge after switching accounts", async () => {
  const get = mockPasskeySession();
  let deliver!: (data: typeof challengeResponse) => void;
  const view = render(<App />);
  const verify = await screen.findByRole("button", { name: "Verify passkey" });
  mocks.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        deliver = resolve;
      }),
  );
  fireEvent.click(verify);
  mocks.identity = { ...mocks.identity, walletAddress: "C-other" };
  view.rerender(<App />);
  await act(async () => deliver(challengeResponse));
  expect(get).not.toHaveBeenCalled();
  expect(screen.getByTestId("token").textContent).toBe("");
});

it("renews an expired social token using the signed browser session", async () => {
  const get = mockPasskeySession();
  vi.useFakeTimers();
  try {
    await act(async () => {
      render(<App />);
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify passkey" })));
    expect(screen.getByTestId("token").textContent).toBe("verified");
    mocks.fetch.mockResolvedValue(response("renewed"));
    await act(async () => vi.advanceTimersByTime(900_000));
    expect(screen.getByTestId("token").textContent).toBe("renewed");
    expect(screen.queryByRole("button", { name: "Verify passkey" })).toBeNull();
    expect(get).toHaveBeenCalledOnce();
    expect(JSON.parse(mocks.fetch.mock.calls[3]![1].body).action).toBe("resume");
  } finally {
    vi.useRealTimers();
  }
});

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
