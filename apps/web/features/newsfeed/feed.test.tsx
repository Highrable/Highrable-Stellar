import { api } from "@repo/convex-client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { FunctionReturnType } from "convex/server";

import { Feed, MediaItem, PostCard } from "./feed";
const mock = vi.hoisted(() => ({ mutate: vi.fn(), paginated: vi.fn(), readMedia: vi.fn() }));
vi.mock("./session", () => ({
  useSocialSession: () => ({ token: "verified", viewer: { _id: "viewer" } }),
}));
vi.mock("./composer", () => ({ Composer: () => null }));
vi.mock("convex/react", () => ({
  useConvex: () => ({ mutation: mock.mutate }),
  useMutation: () => mock.mutate,
  useQuery: () => null,
  usePaginatedQuery: mock.paginated,
}));
vi.mock("./media-client", () => ({ readMedia: mock.readMedia, uploadMedia: vi.fn() }));
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
  media: [],
  viewerReaction: "Like",
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
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:media"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  mock.mutate.mockReset();
  mock.paginated.mockReset();
  mock.readMedia.mockReset();
  mock.readMedia.mockResolvedValue(new Blob(["media"]));
  mock.paginated.mockReturnValue({ results: [post], status: "Exhausted", loadMore: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
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
  fireEvent.click(screen.getByRole("button", { name: "Like" }));
  fireEvent.click(await screen.findByRole("button", { name: "React Love" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Like" })).toBeTruthy();
});
it("opens comments and submits a comment without randomUUID", async () => {
  vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
  mock.paginated.mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });
  mock.mutate.mockResolvedValue("comment-1");
  render(<PostCard post={post} />);
  fireEvent.click(screen.getByRole("button", { name: "Comment" }));
  const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Write a comment" });
  fireEvent.change(input, { target: { value: "Thanks for sharing" } });
  fireEvent.click(screen.getByRole("button", { name: "Post" }));

  await waitFor(() => expect(input.value).toBe(""));
  expect(mock.mutate).toHaveBeenCalledWith(api.newsfeed.mutations.comment, {
    token: "verified",
    postId: post._id,
    requestId: expect.any(String),
    body: "Thanks for sharing",
  });
});
it("uses wallet-free profile links and copies post links from the options menu", async () => {
  render(<Feed authorId={post.authorId} />);
  expect(mock.paginated).toHaveBeenCalledWith(
    api.newsfeed.queries.feed,
    { authorId: post.authorId, token: "verified" },
    { initialNumItems: 10 },
  );
  expect(screen.getByRole("article")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Highrable participant/ }).getAttribute("href")).toBe(
    "/people/author",
  );
  expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  fireEvent.click(screen.getByRole("button", { name: "Post options" }));
  expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Share post" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect((await screen.findByRole("status")).textContent).toBe("Link copied.");
  expect(writeText).toHaveBeenCalledWith("http://localhost:3000/newsfeed/post-1");
});
it("offers a generic attachment control without querying media for every card", () => {
  render(
    <PostCard
      post={
        {
          ...post,
          mediaCount: 1,
          media: [{ _id: "media-1", name: "photo.png", mime: "image/png", size: 1024 }],
        } as typeof post
      }
    />,
  );
  expect(screen.queryByText("photo.png")).toBeNull();
  expect(screen.getByRole("button", { name: "Load photo" })).toBeTruthy();
  expect(mock.paginated).not.toHaveBeenCalled();
});
it("uses post skeletons for the first page and keeps loaded posts during pagination", () => {
  const loadMore = vi.fn();
  mock.paginated.mockReturnValue({ results: [], status: "LoadingFirstPage", loadMore });
  const { rerender } = render(<Feed />);
  const initial = screen.getByRole("status", { name: "Loading posts" });
  expect(initial.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  expect(initial.textContent).toBe("");

  mock.paginated.mockReturnValue({ results: [post], status: "CanLoadMore", loadMore });
  rerender(<Feed />);
  fireEvent.click(screen.getByRole("button", { name: "Load more posts" }));
  expect(loadMore).toHaveBeenCalledWith(10);
  mock.paginated.mockReturnValue({ results: [post], status: "LoadingMore", loadMore });
  rerender(<Feed />);
  expect(screen.getByRole("article")).toBeTruthy();
  expect(screen.getByRole("status", { name: "Loading more posts" }).textContent).toBe("");
});

it("keeps the skeleton until a photo displays and uses a generic attachment label", async () => {
  let finishDownload!: (blob: Blob) => void;
  mock.readMedia.mockReturnValue(
    new Promise<Blob>((resolve) => {
      finishDownload = resolve;
    }),
  );
  const { container } = render(
    <MediaItem
      media={{ _id: "media-1" as never, name: "private.png", mime: "image/png", size: 10 }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Load photo" }));
  const pending = screen.getByRole("status", { name: "Loading media" });
  expect(pending.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  expect(pending.textContent).toBe("");
  expect(screen.queryByText("private.png")).toBeNull();

  await act(async () => finishDownload(new Blob(["photo"])));
  expect(pending.isConnected).toBe(true);
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.load(container.querySelector("img")!);
  expect(screen.getByRole("img", { name: "Photo attachment" })).toBeTruthy();
  expect(screen.queryByRole("status", { name: "Loading media" })).toBeNull();
  expect(container.innerHTML).not.toContain("private.png");
});
it("starts media pagination only after opening more attachments", () => {
  mock.paginated.mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });
  render(
    <PostCard
      post={
        {
          ...post,
          mediaCount: 5,
          media: [1, 2, 3, 4].map((index) => ({
            _id: `media-${index}`,
            name: `photo-${index}.png`,
            mime: "image/png",
            size: 1024,
          })),
        } as typeof post
      }
    />,
  );
  expect(mock.paginated).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show more media" }));
  expect(mock.paginated).toHaveBeenCalledWith(
    api.newsfeed.queries.media,
    { postId: post._id },
    { initialNumItems: 8 },
  );
});
it("automatically loads nearby photos and offers retry after a failed read", async () => {
  class ImmediateIntersectionObserver {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ target, isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    readonly root = null;
    readonly rootMargin = "300px 0px";
    readonly thresholds = [0];
  }
  vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
  mock.readMedia.mockRejectedValueOnce(new Error("Media read failed"));
  render(
    <MediaItem
      media={{ _id: "media-1" as never, name: "photo.png", mime: "image/png", size: 10 }}
      auto
    />,
  );
  await screen.findByRole("alert");
  expect(mock.readMedia).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Retry loading media" }));
  await waitFor(() => expect(mock.readMedia).toHaveBeenCalledTimes(2));
});
it("keeps video on demand and uses inline controls after loading", async () => {
  render(
    <MediaItem
      media={{ _id: "video-1" as never, name: "clip.mp4", mime: "video/mp4", size: 10 }}
      auto
    />,
  );
  expect(mock.readMedia).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Load video" }));
  await waitFor(() => expect(document.querySelector("video")).toBeTruthy());
  const video = document.querySelector("video")!;
  expect(video.getAttribute("controls")).not.toBeNull();
  expect(video.getAttribute("preload")).toBe("none");
  expect(video.playsInline).toBe(true);
  expect(mock.readMedia).toHaveBeenCalledTimes(1);
});

const postVideo: (typeof post.media)[number] = {
  _id: "video-1" as (typeof post.media)[number]["_id"],
  name: "clip.mp4",
  mime: "video/mp4",
  size: 10,
};

function observePostVideos() {
  const observers: { reportVisibility: (ratio: number) => void; disconnect: () => void }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      readonly disconnect = vi.fn();
      constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
        expect(options.threshold).toBe(0.5);
        observers.push({
          reportVisibility: (ratio) =>
            act(() => {
              callback(
                [
                  {
                    isIntersecting: ratio > 0,
                    intersectionRatio: ratio,
                  } as IntersectionObserverEntry,
                ],
                this as unknown as IntersectionObserver,
              );
            }),
          disconnect: this.disconnect,
        });
      }
      observe() {}
    },
  );
  return observers;
}

it("loads a published post video when half visible, plays with sound, and pauses on scroll out", async () => {
  const observers = observePostVideos();
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const { unmount } = render(<PostCard post={{ ...post, mediaCount: 1, media: [postVideo] }} />);
  const observer = observers[0]!;
  observer.reportVisibility(0.49);
  expect(mock.readMedia).not.toHaveBeenCalled();

  observer.reportVisibility(0.5);
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  const video = document.querySelector("video");
  expect(video?.muted).toBe(false);
  expect(video?.controls).toBe(true);
  expect(video?.playsInline).toBe(true);

  observer.reportVisibility(0.49);
  expect(pause).toHaveBeenCalledTimes(1);
  observer.reportVisibility(0.6);
  expect(play).toHaveBeenCalledTimes(2);
  expect(mock.readMedia).toHaveBeenCalledTimes(1);
  unmount();
  expect(observer.disconnect).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:media");
});

it("retries autoplay muted when the browser requires a gesture for sound", async () => {
  const observers = observePostVideos();
  const mutedAttempts: boolean[] = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(
    function (this: HTMLVideoElement) {
      mutedAttempts.push(this.muted);
      return this.muted
        ? Promise.resolve()
        : Promise.reject(new DOMException("Gesture required", "NotAllowedError"));
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  render(<MediaItem media={postVideo} playInView />);
  observers[0]!.reportVisibility(1);
  await waitFor(() => expect(mutedAttempts).toEqual([false, true]));
  expect(document.querySelector("video")?.muted).toBe(true);
});

it("pauses the previous post video when another starts playing", async () => {
  const observers = observePostVideos();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(false);
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  render(
    <>
      <MediaItem media={postVideo} playInView />
      <MediaItem media={{ ...postVideo, name: "second.mp4" }} playInView />
    </>,
  );
  observers[0]!.reportVisibility(1);
  const first = await screen.findByLabelText("Video attachment");
  fireEvent.play(first);
  observers[1]!.reportVisibility(1);
  const second = await waitFor(() => {
    const videos = screen.getAllByLabelText("Video attachment");
    expect(videos).toHaveLength(2);
    return videos[1]!;
  });
  fireEvent.play(second);
  expect(pause).toHaveBeenCalledTimes(1);
  expect(pause.mock.contexts[0]).toBe(first);
});

it("does not start playback after a delayed download finishes offscreen", async () => {
  const observers = observePostVideos();
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  let finishDownload: (blob: Blob) => void = () => {};
  mock.readMedia.mockReturnValue(
    new Promise<Blob>((resolve) => {
      finishDownload = resolve;
    }),
  );
  render(<MediaItem media={postVideo} playInView />);
  const observer = observers[0]!;
  observer.reportVisibility(1);
  expect(screen.getByRole("status", { name: "Loading media" }).textContent).toBe("");
  expect(screen.queryByText("clip.mp4")).toBeNull();
  observer.reportVisibility(0);
  await act(async () => finishDownload(new Blob(["video"])));
  expect(document.querySelector("video")).toBeTruthy();
  expect(screen.queryByRole("status", { name: "Loading media" })).toBeNull();
  expect(play).not.toHaveBeenCalled();
  observer.reportVisibility(1);
  expect(play).toHaveBeenCalledTimes(1);
  expect(mock.readMedia).toHaveBeenCalledTimes(1);
});

it("offers a manual retry after an automatic video download fails", async () => {
  const observers = observePostVideos();
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  mock.readMedia.mockRejectedValueOnce(new Error("Media read failed"));
  render(<MediaItem media={postVideo} playInView />);
  observers[0]!.reportVisibility(1);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Retry loading media" }));
  await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  expect(mock.readMedia).toHaveBeenCalledTimes(2);
});
