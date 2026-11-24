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
vi.mock("@/features/attachments/components", () => ({
  AttachmentFileIcon: () => null,
  AttachmentPreviewCard: () => null,
  AttachmentTypeBadge: ({ type }: { type: string }) => <span>{type}</span>,
  AttachmentUploader: ({
    onChange,
  }: {
    onChange: (value: Array<{ id: string; name: string; type: string; status: "ready" }>) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange([{ id: "attachment-photo", name: "photo.png", type: "image", status: "ready" }])
      }
    >
      Add sample photo
    </button>
  ),
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

it("sends uploaded media IDs with a message from the conversation composer", async () => {
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
      status: "active",
    },
  ];
  render(<MessagesPage />);
  fireEvent.click(screen.getByRole("button", { name: /Ben Designer/ }));
  fireEvent.click(screen.getByRole("button", { name: "Attach files or media" }));
  fireEvent.click(screen.getByRole("button", { name: "Add sample photo" }));
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));

  await waitFor(() =>
    expect(mocks.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        sessionToken: "verified-session",
        body: "",
        attachmentIds: ["attachment-photo"],
      }),
    ),
  );
});

it("submits with Enter from the keyboard composer", async () => {
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
      status: "active",
    },
  ];
  render(<MessagesPage />);
  fireEvent.click(screen.getByRole("button", { name: /Ben Designer/ }));
  const composer = screen.getByRole("textbox", { name: "Message text" });
  fireEvent.change(composer, { target: { value: "Quick update" } });
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
  expect(mocks.mutation).not.toHaveBeenCalled();

  fireEvent.keyDown(composer, { key: "Enter", shiftKey: false });
  await waitFor(() =>
    expect(mocks.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        sessionToken: "verified-session",
        body: "Quick update",
      }),
    ),
  );
});

it.each([
  ["locked", "This conversation is locked."],
  ["archived", "This conversation is archived."],
] as const)("keeps %s conversations read-only", (status, message) => {
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
      status,
    },
  ];
  render(<MessagesPage />);
  fireEvent.click(screen.getByRole("button", { name: /Ben Designer/ }));

  expect(screen.getByRole("status").textContent).toContain(message);
  expect(screen.getByRole("textbox", { name: "Message text" }).hasAttribute("disabled")).toBe(true);
  expect(
    screen.getByRole("button", { name: "Attach files or media" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByRole("button", { name: "Send message" }).hasAttribute("disabled")).toBe(true);
});
