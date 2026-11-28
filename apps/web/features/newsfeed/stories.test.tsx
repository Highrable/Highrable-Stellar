import { api } from "@repo/convex-client";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { FunctionReturnType } from "convex/server";

import { Stories } from "./stories";

const mock = vi.hoisted(() => ({
  groups: [] as unknown[] | undefined,
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
  useConvex: () => ({ mutation: mock.mutate }),
  useMutation: () => mock.mutate,
  usePaginatedQuery: mock.paginated,
  useQuery: (_query: unknown, args: { mediaId?: string; token?: string } | "skip") =>
    args === "skip" ? undefined : args.mediaId ? mock.preview : mock.groups,
}));
vi.mock("./media-client", () => ({
  readMedia: mock.readMedia,
  uploadMedia: mock.uploadMedia,
}));
vi.mock("./image-editor", () => ({
  ImageEditor: ({ file, onSave }: { file: File | null; onSave: (file: File) => void }) =>
    file ? (
      <button
        type="button"
        onClick={() =>
          onSave(new File(["edited story image"], "story-edited.webp", { type: "image/webp" }))
        }
      >
        Apply test edits
      </button>
    ) : null,
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

it("uses a circular skeleton tray while showcases are being fetched", () => {
  mock.groups = undefined;
  const { rerender } = render(<Stories />);
  const tray = screen.getByRole("status", { name: "Loading showcases" });
  expect(tray.querySelectorAll(".rounded-full").length).toBeGreaterThan(1);
  expect(tray.textContent).toBe("");

  mock.groups = groups;
  rerender(<Stories />);
  expect(screen.queryByRole("status", { name: "Loading showcases" })).toBeNull();
  expect(screen.getByRole("button", { name: "View Ada Builder's showcase" })).toBeTruthy();
});

it("groups stories by author and navigates through stories", async () => {
  render(<Stories />);
  const createStory = screen.getByRole("button", { name: "Create a showcase" });
  expect(createStory.textContent).toContain("Add showcase");
  expect(createStory.querySelector("svg")).toBeTruthy();
  const authorStory = screen.getByRole("button", { name: "View Ada Builder's showcase" });
  expect(authorStory.className).toContain("flex-col");
  expect(authorStory.querySelector('[class*="rounded-full"]')).toBeTruthy();
  expect(authorStory.textContent).toContain("Ada Builder");
  expect(screen.getAllByRole("button", { name: "View Ada Builder's showcase" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's showcase" }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Next showcase item" }));
  fireEvent.click(screen.getByRole("button", { name: "Next showcase item" }));
  expect(await screen.findByRole("heading", { name: "Bobby Aleto" })).toBeTruthy();
});

it("keeps the showcase on the loading photo and advances after the image appears", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => "blob:story-photo"),
      revokeObjectURL: vi.fn(),
    }),
  );
  try {
    const { baseElement } = render(<Stories />);
    fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's showcase" }));
    expect(screen.getByRole("group", { name: "Showcase item 1 of 2" })).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("group", { name: "Showcase item 1 of 2" })).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Loading media" }).querySelector('[data-slot="skeleton"]'),
    ).toBeTruthy();
    const photo = baseElement.querySelector('img[alt="Showcase photo"]')!;
    fireEvent.load(photo);
    expect(screen.getByRole("img", { name: "Showcase photo" })).toBeTruthy();
    expect(screen.queryByText("story.png")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByRole("group", { name: "Showcase item 2 of 2" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's showcase" }));
    await waitFor(() => expect(mock.readMedia).toHaveBeenCalled());
    const video = await screen.findByLabelText("Showcase video");
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
  fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's showcase" }));
  await screen.findByRole("dialog");
  const love = screen.getByRole("button", { name: "React Love" });
  fireEvent.click(love);
  await screen.findByRole("alert");
  expect(love.getAttribute("aria-pressed")).toBe("false");
});

it("lets the story author delete their story", async () => {
  render(<Stories />);
  fireEvent.click(screen.getByRole("button", { name: "View Ada Builder's showcase" }));
  await screen.findByRole("button", { name: "Delete showcase" });
  fireEvent.click(screen.getByRole("button", { name: "Delete showcase" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mock.mutate).toHaveBeenCalledTimes(1);
});
it("uploads an edited story image after applying edits to the draft", async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:story-draft"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  mock.mutate.mockImplementation(async (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref).endsWith("beginStory") ? "story-draft" : undefined,
  );
  mock.uploadMedia.mockResolvedValue("uploaded-story-image");
  try {
    render(<Stories />);
    fireEvent.click(screen.getByRole("button", { name: "Create a showcase" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Caption (optional)" }), {
      target: { value: "Dashboard prototype WIP" },
    });
    const tags = screen.getByText("Add tags (optional)");
    expect(tags.closest("details")?.open).toBe(false);
    fireEvent.click(tags);
    expect(tags.closest("details")?.open).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: /^Tags/i }), {
      target: { value: "WIP, Figma" },
    });
    fireEvent.change(screen.getByLabelText("Choose showcase photos or videos"), {
      target: { files: [new File(["original"], "story.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Edit image" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply test edits" }));
    expect(screen.getByRole("img", { name: "Attachment preview 1" })).toBeTruthy();
    expect(screen.queryByText("story-edited.webp")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Share showcase" }));
    await waitFor(() => expect(mock.uploadMedia).toHaveBeenCalled());
    expect(mock.uploadMedia.mock.calls[0]?.[1].file.name).toBe("story-edited.webp");
    expect(mock.uploadMedia.mock.calls[0]?.[1].file.type).toBe("image/webp");
    const beginCall = mock.mutate.mock.calls.find(([ref]) =>
      getFunctionName(ref).endsWith("beginStory"),
    );
    expect(beginCall?.[1]).toMatchObject({
      note: "Dashboard prototype WIP",
      tags: ["WIP", "Figma"],
    });
  } finally {
    cleanup();
    if (originalCreate) {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreate,
      });
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevoke) {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevoke,
      });
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  }
});

it("publishes dropped showcase media when randomUUID is unavailable", async () => {
  vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:dropped-story-draft"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  mock.mutate.mockImplementation(async (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref).endsWith("beginStory") ? "story-draft" : undefined,
  );
  mock.uploadMedia.mockResolvedValue("uploaded-dropped-story");

  try {
    render(<Stories />);
    fireEvent.click(screen.getByRole("button", { name: "Create a showcase" }));
    expect(screen.getByText("Public for 24 hours")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Share showcase" }).disabled).toBe(
      true,
    );
    const dropzone = await screen.findByRole("button", {
      name: "Add photos or videos to your showcase",
    });
    const file = new File(["image bytes"], "dropped-dashboard.png", { type: "image/png" });

    fireEvent.dragOver(dropzone, { dataTransfer: { files: [file] } });
    expect(dropzone.className).toContain("border-primary bg-primary/10");
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(await screen.findByRole("img", { name: "Attachment preview 1" })).toBeTruthy();
    expect(screen.queryByText("dropped-dashboard.png")).toBeNull();
    expect(dropzone.textContent).toContain("Add more photos or videos");
    expect(dropzone.className).not.toContain("border-primary bg-primary/10");
    fireEvent.click(screen.getByRole("button", { name: "Share showcase" }));
    await waitFor(() => expect(mock.uploadMedia).toHaveBeenCalled());
    expect(mock.uploadMedia.mock.calls[0]?.[1].file).toBe(file);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  } finally {
    cleanup();
    if (originalCreate) {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreate,
      });
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevoke) {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevoke,
      });
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  }
});

it("shows a showcase upload skeleton without displaying the filename", async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:pending-showcase"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  mock.mutate.mockImplementation(async (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref).endsWith("beginStory") ? "story-draft" : undefined,
  );
  mock.uploadMedia.mockImplementation(
    (_client, input) =>
      new Promise((_resolve, reject) => {
        input.signal.addEventListener("abort", () => reject(new Error("Upload cancelled.")), {
          once: true,
        });
      }),
  );
  try {
    render(<Stories />);
    fireEvent.click(screen.getByRole("button", { name: "Create a showcase" }));
    fireEvent.change(screen.getByLabelText("Choose showcase photos or videos"), {
      target: {
        files: [new File(["video bytes"], "private-showcase.mp4", { type: "video/mp4" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share showcase" }));

    const progress = await screen.findByRole("progressbar", { name: "Uploading selected media" });
    expect(progress.closest("li")?.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.queryByText("private-showcase.mp4")).toBeNull();
  } finally {
    cleanup();
    if (originalCreate) {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreate,
      });
    } else {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevoke) {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevoke,
      });
    } else {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  }
});
