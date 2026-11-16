import { api } from "@repo/convex-client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { FunctionReturnType } from "convex/server";

import { Stories } from "./stories";

const mock = vi.hoisted(() => ({
  groups: [] as unknown[],
  mutate: vi.fn(),
  paginated: vi.fn(),
  preview: "data:image/jpeg;base64,dGh1bWI=",
  readMedia: vi.fn(),
  uploadMedia: vi.fn(),
}));
vi.mock("./session", () => ({
  useSocialSession: () => ({
    token: "verified-session",
    viewer: {
      _id: "author-1",
      name: "Ada Builder",
      avatarUrl: "https://cdn.example/ada.jpg",
    },
  }),
}));
vi.mock("convex/react", () => ({
  useConvex: () => ({}),
  useMutation: () => mock.mutate,
  usePaginatedQuery: mock.paginated,
  useQuery: (_query: unknown, args: { mediaId?: string; token?: string } | "skip") =>
    args === "skip" ? undefined : args.mediaId ? mock.preview : mock.groups,
}));
vi.mock("./media-client", () => ({
  readMedia: mock.readMedia,
  uploadMedia: mock.uploadMedia,
}));

const media: { _id: string; name: string; mime: string; size: number; preview?: string } = {
  _id: "media-1",
  name: "story.png",
  mime: "image/png",
  size: 12,
  preview: "data:image/jpeg;base64,dGh1bWI=",
};
const videoMedia = { _id: "video-1", name: "story.mp4", mime: "video/mp4", size: 12 };
const reactionCounts = {
  Like: 0,
  Celebrate: 0,
  Support: 0,
  Love: 0,
  Insightful: 0,
  Funny: 0,
};
function story(id: string, item = media) {
  return {
    _id: id,
    publishedAt: 1,
    expiresAt: Date.now() + 60_000,
    mediaCount: 1,
    reactionCount: 0,
    reactionCounts,
    viewerReaction: null,
    media: [item],
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
  mock.preview = "data:image/jpeg;base64,dGh1bWI=";
  mock.mutate.mockReset().mockResolvedValue(undefined);
  mock.readMedia.mockReset().mockResolvedValue(new Blob(["story media"]));
  mock.uploadMedia.mockReset();
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
  const createStory = screen.getByRole("button", { name: "Create a story" });
  expect(createStory.querySelector('img[src="https://cdn.example/ada.jpg"]')).toBeTruthy();
  const authorStory = screen.getByRole("button", { name: "View Ada Builder's stories" });
  await waitFor(() =>
    expect(authorStory.querySelector('img[src="data:image/jpeg;base64,dGh1bWI="]')).toBeTruthy(),
  );
  expect(screen.getAllByRole("button", { name: "View Ada Builder's stories" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's stories" }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Next story item" }));
  fireEvent.click(screen.getByRole("button", { name: "Next story item" }));
  expect(await screen.findByRole("heading", { name: "Bobby Aleto" })).toBeTruthy();
});

it("automatically advances after showing a photo story preview", async () => {
  vi.useFakeTimers();
  try {
    render(<Stories />);
    fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's stories" }));
    expect(screen.getByRole("group", { name: "Story 1 of 2" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("group", { name: "Story 2 of 2" })).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

it("loads and autoplays only the video opened in the story viewer", async () => {
  mock.groups = [
    {
      ...groups[0],
      stories: [story("story-video", videoMedia)],
    },
  ] as unknown as typeof groups;
  mock.paginated.mockReturnValue({
    results: [videoMedia],
    status: "Exhausted",
    loadMore: vi.fn(),
  });
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:story-video"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  try {
    render(<Stories />);
    fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's stories" }));
    await waitFor(() => expect(mock.readMedia).toHaveBeenCalled());
    const video = await screen.findByLabelText("story.mp4");
    expect(video.hasAttribute("autoplay")).toBe(true);
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(video.hasAttribute("controls")).toBe(true);
    fireEvent.ended(video);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  } finally {
    cleanup();
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectURL,
      });
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  }
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
