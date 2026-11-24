import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { MessagesPage } from "./messages-page";

const mocks = vi.hoisted(() => ({
  token: "verified-session",
  wallet: "G" + "A".repeat(55),
  conversations: [] as Array<Record<string, unknown>>,
  people: [] as Array<Record<string, unknown>>,
  mutation: vi.fn(),
  loadMore: vi.fn(),
}));

vi.mock("@/features/newsfeed/session", () => ({
  SocialSession: ({ children }: { children: React.ReactNode }) => children,
  useSocialSession: () => ({ token: mocks.token, viewer: null }),
}));
vi.mock("@/core/wallet/hooks/use-highrable-wallet-identity", () => ({
  useHighrableWalletIdentity: () => ({ walletAddress: mocks.wallet }),
}));
vi.mock("convex/react", () => ({
  useQuery: (_reference: unknown, args: unknown) => {
    if (args !== "skip" && typeof args === "object" && args !== null && "conversationId" in args) {
      return { participantWallets: [], participantWalletTypes: [] };
    }
    if (args !== "skip" && typeof args === "object" && args !== null && "term" in args) {
      return mocks.people;
    }
    if (args !== "skip" && typeof args === "object" && args !== null && "sessionToken" in args) {
      return mocks.token ? mocks.conversations : undefined;
    }
    return undefined;
  },
  useMutation: () => mocks.mutation,
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: mocks.loadMore }),
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.token = "verified-session";
  mocks.conversations = [];
  mocks.people = [];
  mocks.mutation.mockReset();
  mocks.loadMore.mockReset();
  mocks.mutation.mockImplementation(async () => "conversation-1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows verified-session state before loading any private conversations", () => {
  mocks.token = "";
  render(<MessagesPage />);
  expect(screen.getByRole("heading", { name: "Messages" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain(
    "Verify your connected wallet or passkey",
  );
});

it("renders the General and Clients empty states and switches categories accessibly", () => {
  render(<MessagesPage />);
  expect(screen.getByText("No general chats yet")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clients" }));
  expect(screen.getByText("No client conversations yet")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Clients" }).getAttribute("aria-pressed")).toBe("true");
});

it("finds a registered person and opens a direct conversation", async () => {
  const person = { userId: "user-ben", name: "Ben Designer" };
  mocks.people = [person];
  mocks.mutation.mockImplementation(async () => {
    mocks.conversations = [
      {
        _id: "conversation-1",
        parentType: "direct",
        participantWallets: [mocks.wallet, "G" + "B".repeat(55)],
        participantProfiles: [
          { walletAddress: mocks.wallet, displayName: "Ada" },
          { walletAddress: "G" + "B".repeat(55), displayName: "Ben Designer" },
        ],
        unread: false,
      },
    ];
    return "conversation-1";
  });
  render(<MessagesPage />);
  fireEvent.click(screen.getByRole("button", { name: "New message" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Search registered people" }), {
    target: { value: "Ben" },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Ben Designer" }));
  await waitFor(() => expect(screen.getByText("Direct conversation")).toBeTruthy());
  expect(mocks.mutation).toHaveBeenCalledWith({
    sessionToken: "verified-session",
    otherUserId: "user-ben",
  });
});
