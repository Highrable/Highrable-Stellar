import { api } from "@repo/convex-client";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { FunctionReturnType } from "convex/server";

import { Feed, PostCard } from "./feed";
const mock = vi.hoisted(() => ({ mutate: vi.fn(), paginated: vi.fn() }));
vi.mock("./session", () => ({
  useSocialSession: () => ({ token: "verified", viewer: { _id: "viewer" } }),
}));
vi.mock("./composer", () => ({ Composer: () => null }));
vi.mock("convex/react", () => ({
  useConvex: () => ({}),
  useMutation: () => ({ withOptimisticUpdate: () => mock.mutate }),
  useQuery: () => ({ kind: "Like" }),
  usePaginatedQuery: mock.paginated,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
const post = {
  _id: "post-1",
  _creationTime: 1,
  authorId: "author",
  requestId: "key",
  status: "published",
  reactionCount: 1,
  commentCount: 0,
  pendingMedia: 0,
  mediaCount: 0,
  updatedAt: 1,
  preview: "<script>not executable</script>",
  bodySize: 0,
  original: null,
  author: {
    id: "author",
    name: "Highrable participant",
    avatarUrl: null,
    walletAddress: "GSECRETADDRESS",
    role: "client",
  },
} as unknown as NonNullable<FunctionReturnType<typeof api.newsfeed.queries.post>>;
beforeEach(() => {
  vi.stubGlobal("React", React);
  mock.mutate.mockReset();
  mock.paginated.mockReset();
  mock.paginated.mockReturnValue({ results: [post], status: "Exhausted", loadMore: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("renders participant names, safe text, and unavailable originals", () => {
  render(<PostCard post={{ ...post, originalId: "original" as typeof post._id }} />);
  expect(screen.getByText("Highrable participant")).toBeTruthy();
  expect(screen.queryByText("GSECRETADDRESS")).toBeNull();
  expect(screen.getByText("<script>not executable</script>")).toBeTruthy();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getByText("Original post unavailable.")).toBeTruthy();
});
it("shows failed reaction feedback while retaining the last confirmed value", async () => {
  mock.mutate.mockRejectedValue(new Error("Session expired"));
  render(<PostCard post={post} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Choose a reaction" }), {
    target: { value: "Love" },
  });
  await screen.findByRole("alert");
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("Like");
});
it("uses the author-filtered feed for profile activity and renders the shared card", () => {
  render(<Feed authorId={post.authorId} />);
  expect(mock.paginated).toHaveBeenCalledWith(
    api.newsfeed.queries.feed,
    { authorId: post.authorId },
    { initialNumItems: 10 },
  );
  expect(screen.getByRole("article")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
});
