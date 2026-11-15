import { api } from "@repo/convex-client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { FunctionReturnType } from "convex/server";

import { Stories } from "./stories";

const mock = vi.hoisted(() => ({
  groups: [] as unknown[],
  mutate: vi.fn(),
  paginated: vi.fn(),
}));
vi.mock("./session", () => ({
  useSocialSession: () => ({
    token: "verified-session",
    viewer: { _id: "author-1", name: "Ada Builder", avatarUrl: null },
  }),
}));
vi.mock("convex/react", () => ({
  useConvex: () => ({}),
  useMutation: () => mock.mutate,
  usePaginatedQuery: mock.paginated,
  useQuery: () => mock.groups,
}));
vi.mock("./media-client", () => ({
  readMedia: vi.fn(),
  uploadMedia: vi.fn(),
}));

const media = { _id: "media-1", name: "story.png", mime: "image/png", size: 12 };
const reactionCounts = {
  Like: 0,
  Celebrate: 0,
  Support: 0,
  Love: 0,
  Insightful: 0,
  Funny: 0,
};
function story(id: string) {
  return {
    _id: id,
    publishedAt: 1,
    expiresAt: Date.now() + 60_000,
    mediaCount: 1,
    reactionCount: 0,
    reactionCounts,
    viewerReaction: null,
    media: [media],
  };
}
const groups = [
  {
    author: {
      id: "author-1",
      name: "Ada Builder",
      avatarUrl: null,
      walletAddress: "",
      role: "client",
    },
    stories: [story("story-1"), story("story-2")],
  },
  {
    author: {
      id: "author-2",
      name: "Bobby Aleto",
      avatarUrl: null,
      walletAddress: "",
      role: "freelancer",
    },
    stories: [story("story-3")],
  },
] as unknown as FunctionReturnType<typeof api.newsfeed.queries.activeStories>;
beforeEach(() => {
  vi.stubGlobal("React", React);
  mock.groups = groups;
  mock.mutate.mockReset().mockResolvedValue(undefined);
  mock.paginated
    .mockReset()
    .mockReturnValue({ results: [media], status: "Exhausted", loadMore: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("groups stories by author and navigates through stories", async () => {
  render(<Stories />);
  expect(screen.getAllByRole("button", { name: "View Ada Builder's stories" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's stories" }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Next story item" }));
  fireEvent.click(screen.getByRole("button", { name: "Next story item" }));
  expect(await screen.findByRole("heading", { name: "Bobby Aleto" })).toBeTruthy();
});

it("restores the confirmed story reaction after a failed request", async () => {
  mock.mutate.mockRejectedValueOnce(new Error("Session expired"));
  render(<Stories />);
  fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's stories" }));
  await screen.findByRole("dialog");
  const love = screen.getByRole("button", { name: "React Love" });
  fireEvent.click(love);
  await screen.findByRole("alert");
  expect(love.getAttribute("aria-pressed")).toBe("false");
});

it("lets the story author delete their story", async () => {
  render(<Stories />);
  fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's stories" }));
  await screen.findByRole("button", { name: "Delete story" });
  fireEvent.click(screen.getByRole("button", { name: "Delete story" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mock.mutate).toHaveBeenCalledTimes(1);
});
