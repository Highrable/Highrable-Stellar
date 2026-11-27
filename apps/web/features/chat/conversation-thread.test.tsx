import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ConversationThread } from "./components/conversation-thread";

const mocks = vi.hoisted(() => ({
  token: "verified-session",
  wallet: "G" + "A".repeat(55),
  conversation: {
    _id: "work-conversation",
    parentType: "job",
    clientWallet: "G" + "A".repeat(55),
    status: "active",
    lastMessageId: "message-peer",
  } as Record<string, unknown>,
  messages: [] as Array<Record<string, unknown>>,
  mutation: vi.fn(),
}));

vi.mock("@/features/newsfeed/session", () => ({
  useSocialSession: () => ({ token: mocks.token, viewer: null }),
}));
vi.mock("@/core/wallet/hooks/use-highrable-wallet-identity", () => ({
  useHighrableWalletIdentity: () => ({ walletAddress: mocks.wallet, walletType: "freighter" }),
}));
vi.mock("@/features/common", () => ({
  sanitizeMultilineInput: (value: string) => value,
  showWarningToast: vi.fn(),
}));
vi.mock("@/features/attachments/components", () => ({
  AttachmentFileIcon: () => null,
  AttachmentTypeBadge: ({ type }: { type: string }) => <span>{type}</span>,
  AttachmentUploader: ({
    onChange,
  }: {
    onChange: (value: Array<{ id: string; name: string; type: string; status: "ready" }>) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange([{ id: "work-attachment", name: "brief.pdf", type: "document", status: "ready" }])
      }
    >
      Add work attachment
    </button>
  ),
}));
vi.mock("@repo/ui/components/highrable/v2-marketing", () => ({
  HighrableV2Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@repo/ui/components/highrable/v2-theme", () => ({
  V2_BUTTON_PRIMARY_CLASS: "primary",
}));
vi.mock("@repo/ui/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
  SheetDescription: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props}>{children}</p>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: (_reference: unknown, args: unknown) =>
    args !== "skip" && typeof args === "object" && args !== null && "parentId" in args
      ? mocks.conversation
      : undefined,
  useMutation: () => mocks.mutation,
  usePaginatedQuery: () => ({ results: mocks.messages, status: "Exhausted", loadMore: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.token = "verified-session";
  mocks.wallet = "G" + "A".repeat(55);
  mocks.conversation = {
    _id: "work-conversation",
    parentType: "job",
    clientWallet: mocks.wallet,
    status: "active",
    lastMessageId: "message-peer",
  };
  mocks.messages = [
    {
      _id: "message-peer",
      kind: "user",
      body: "I uploaded the first draft.",
      senderWallet: "G" + "B".repeat(55),
      senderRole: "freelancer",
      senderWalletType: "freighter",
      senderProfile: {
        walletAddress: "G" + "B".repeat(55),
        displayName: "Ben Designer",
        avatarUrl: "/ben.png",
      },
      status: "active",
      createdAt: Date.now(),
      attachments: [],
    },
  ];
  mocks.mutation.mockReset();
  mocks.mutation.mockResolvedValue(undefined);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps work-thread replies and attachments connected to the current conversation", async () => {
  render(<ConversationThread parentType="job" parentId="job-1" title="Brand refresh" />);

  fireEvent.click(screen.getByRole("button", { name: "Reply" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Message text" }), {
    target: { value: "I will review the draft." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Show attachment uploader" }));
  fireEvent.click(screen.getByRole("button", { name: "Add work attachment" }));
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));

  await waitFor(() =>
    expect(mocks.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "work-conversation",
        sessionToken: "verified-session",
        body: "I will review the draft.",
        attachmentIds: ["work-attachment"],
        replyToMessageId: "message-peer",
      }),
    ),
  );
});

it.each(["locked", "archived"])("keeps %s work threads read-only", (status) => {
  mocks.conversation.status = status;
  render(<ConversationThread parentType="job" parentId="job-1" title="Brand refresh" />);

  expect(screen.getByRole("status").textContent).toContain(`This conversation is ${status}.`);
  expect(screen.getByRole("textbox", { name: "Message text" }).hasAttribute("disabled")).toBe(true);
  expect(
    screen.getByRole("button", { name: "Show attachment uploader" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByRole("button", { name: "Send message" }).hasAttribute("disabled")).toBe(true);
});
