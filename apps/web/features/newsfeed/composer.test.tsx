import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { Composer } from "./composer";
const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  upload: vi.fn(),
  milestones: [] as { id: string; title: string; status: string; jobId: string }[],
  viewer: { _id: "user-1" } as object | null,
}));
function openComposer() {
  fireEvent.click(screen.getByRole("button", { name: "Post options" }));
}
vi.mock("convex/react", () => ({
  useConvex: () => ({ mutation: mocks.mutation }),
  useQuery: () => mocks.milestones,
}));
vi.mock("./session", () => ({
  useSocialSession: () => ({ token: "verified-session", viewer: mocks.viewer }),
}));
vi.mock("./media-client", () => ({ uploadMedia: mocks.upload }));
vi.mock("./image-editor", () => ({
  ImageEditor: ({ file, onSave }: { file: File | null; onSave: (file: File) => void }) =>
    file ? (
      <button
        type="button"
        onClick={() =>
          onSave(new File(["edited image"], "photo-edited.webp", { type: "image/webp" }))
        }
      >
        Apply test edits
      </button>
    ) : null,
}));
beforeEach(() => {
  vi.stubGlobal("React", React);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:composer-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  mocks.viewer = { _id: "user-1" };
  mocks.milestones = [];
  mocks.mutation.mockReset();
  mocks.upload.mockReset();
  mocks.mutation.mockImplementation(async (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref).endsWith("beginPost") ? "post-1" : "post-1",
  );
  mocks.upload.mockResolvedValue("body-1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("publishes a short update directly from the inline composer", async () => {
  render(<Composer />);
  fireEvent.change(screen.getByRole("textbox", { name: "Quick post" }), {
    target: { value: "A short network update" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await waitFor(() =>
    expect(
      mocks.mutation.mock.calls.some(([ref]) => getFunctionName(ref).endsWith(":publish")),
    ).toBe(true),
  );
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("publishes without randomUUID and reuses the draft request ID after a lost response", async () => {
  vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
  let beginAttempts = 0;
  mocks.mutation.mockImplementation(async (ref: Parameters<typeof getFunctionName>[0]) => {
    if (getFunctionName(ref).endsWith(":beginPost") && ++beginAttempts === 1) {
      throw new Error("Connection lost");
    }
    return "post-1";
  });
  render(<Composer />);
  const quickPost = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Quick post" });
  fireEvent.change(quickPost, { target: { value: "First update" } });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await screen.findByRole("alert");
  expect(quickPost.value).toBe("First update");
  fireEvent.click(screen.getByRole("button", { name: "Retry publishing" }));
  await waitFor(() => expect(quickPost.value).toBe(""));

  fireEvent.change(quickPost, { target: { value: "Second update" } });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await waitFor(() => expect(quickPost.value).toBe(""));

  const requestIds = mocks.mutation.mock.calls
    .filter(([ref]) => getFunctionName(ref).endsWith(":beginPost"))
    .map(([, args]) => args.requestId);
  expect(requestIds).toHaveLength(3);
  expect(requestIds[0]).toBe(requestIds[1]);
  expect(requestIds[2]).not.toBe(requestIds[1]);
  expect(mocks.upload).toHaveBeenCalledTimes(2);
  expect(
    mocks.mutation.mock.calls.filter(([ref]) => getFunctionName(ref).endsWith(":publish")),
  ).toHaveLength(2);
});
it("retains text after publication failure and retries the same post without duplicating uploads", async () => {
  let publishCalls = 0;
  mocks.mutation.mockImplementation(async (ref: Parameters<typeof getFunctionName>[0]) => {
    if (getFunctionName(ref).endsWith(":publish") && ++publishCalls === 1)
      throw new Error("Connection lost");
    return "post-1";
  });
  render(<Composer />);
  openComposer();
  fireEvent.change(screen.getByRole("textbox", { name: "Share an update" }), {
    target: { value: "An intact draft 🌏" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
  await screen.findByRole("alert");
  expect(
    (screen.getByRole("textbox", { name: "Share an update" }) as HTMLTextAreaElement).value,
  ).toBe("An intact draft 🌏");
  fireEvent.click(screen.getByRole("button", { name: "Retry publishing" }));
  await waitFor(() =>
    expect(screen.queryByRole("textbox", { name: "Share an update" })).toBeNull(),
  );
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  const begins = mocks.mutation.mock.calls.filter(([ref]) =>
    getFunctionName(ref).endsWith(":beginPost"),
  );
  expect(begins).toHaveLength(1);
});
it("shows the public audience once and preserves a draft when closing the dialog", async () => {
  render(<Composer />);
  openComposer();
  fireEvent.change(screen.getByRole("textbox", { name: "Share an update" }), {
    target: { value: "A draft to keep" },
  });

  expect(screen.getAllByText("Public · Freelance Network")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Public · Freelance Network/i })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  openComposer();
  expect(
    (screen.getByRole("textbox", { name: "Share an update" }) as HTMLTextAreaElement).value,
  ).toBe("A draft to keep");
});
it("requires public milestone confirmation and submits normalized tags", async () => {
  mocks.milestones = [
    { id: "milestone-1", title: "Design system delivery", status: "released", jobId: "job-1" },
  ];
  render(<Composer />);
  openComposer();
  fireEvent.change(screen.getByRole("textbox", { name: "Share an update" }), {
    target: { value: "A milestone update" },
  });
  const options = screen.getByText("Tags and milestone");
  expect(options.closest("details")?.open).toBe(false);
  fireEvent.click(options);
  expect(options.closest("details")?.open).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: /Tags/i }), {
    target: { value: "#Figma, DesignSystems" },
  });
  fireEvent.change(screen.getByLabelText("Attach a milestone (optional)"), {
    target: { value: "milestone-1" },
  });
  const publish = screen.getByRole("button", { name: "Publish post" });
  expect((publish as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(publish);
  await waitFor(() =>
    expect(screen.queryByRole("textbox", { name: "Share an update" })).toBeNull(),
  );
  const publishCall = mocks.mutation.mock.calls.find(([ref]) =>
    getFunctionName(ref).endsWith(":publish"),
  );
  expect(publishCall?.[1]).toMatchObject({
    milestoneId: "milestone-1",
    milestoneConfirmed: true,
    tags: ["Figma", "DesignSystems"],
  });
});
it("does not expose publishing controls to an unverified participant", () => {
  mocks.viewer = null;
  render(<Composer />);
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("retains text after an upload failure and does not publish broken media", async () => {
  mocks.upload.mockRejectedValue(new Error("Upload failed"));
  render(<Composer />);
  openComposer();
  fireEvent.change(screen.getByRole("textbox", { name: "Share an update" }), {
    target: { value: "Keep this content" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
  await screen.findByRole("alert");
  expect(
    (screen.getByRole("textbox", { name: "Share an update" }) as HTMLTextAreaElement).value,
  ).toBe("Keep this content");
  expect(
    mocks.mutation.mock.calls.filter(([ref]) => getFunctionName(ref).endsWith(":publish")),
  ).toHaveLength(0);
});
it("applies image edits to the preview file before publishing", async () => {
  render(<Composer />);
  openComposer();
  const image = new File(["original"], "photo.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Choose post photos or videos"), {
    target: { files: [image] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Edit image" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply test edits" }));
  expect(screen.getByRole("img", { name: "Attachment preview 1" })).toBeTruthy();
  expect(screen.queryByText("photo-edited.webp")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
  await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
  expect(mocks.upload.mock.calls[0]?.[1].file.name).toBe("photo-edited.webp");
  expect(mocks.upload.mock.calls[0]?.[1].file.type).toBe("image/webp");
});
it("keeps video files on the existing preview and upload path", async () => {
  render(<Composer />);
  openComposer();
  const video = new File(["video bytes"], "walkthrough.mp4", { type: "video/mp4" });
  fireEvent.change(screen.getByLabelText("Choose post photos or videos"), {
    target: { files: [video] },
  });
  expect(screen.getByLabelText("Video preview 1")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit image" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
  await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
  expect(mocks.upload.mock.calls[0]?.[1].file).toBe(video);
});
it("opens the file picker directly and lets users review a media-only draft before publishing", async () => {
  render(<Composer />);
  const picker = screen.getByLabelText("Choose quick post photos or videos");
  const openPicker = vi.spyOn(picker, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Add media" }));
  expect(openPicker).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();

  const photo = new File(["photo data"], "progress.png", { type: "image/png" });
  fireEvent.change(picker, { target: { files: [photo] } });
  await screen.findByRole("dialog", { name: "Create a post" });
  expect(screen.getByRole("img", { name: "Attachment preview 1" })).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  fireEvent.click(await screen.findByRole("button", { name: "Review draft" }));
  expect(screen.getByRole("img", { name: "Attachment preview 1" })).toBeTruthy();
  expect(mocks.mutation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.upload.mock.calls[0]?.[1].file).toBe(photo);
});
it("shows upload progress and a skeleton without revealing the filename", async () => {
  mocks.upload.mockImplementation(
    (_client, input) =>
      new Promise((_resolve, reject) => {
        input.signal.addEventListener("abort", () => reject(new Error("Upload cancelled.")), {
          once: true,
        });
      }),
  );
  render(<Composer />);
  openComposer();
  fireEvent.change(screen.getByLabelText("Choose post photos or videos"), {
    target: { files: [new File(["video bytes"], "private-cut.mp4", { type: "video/mp4" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish post" }));

  const progress = await screen.findByRole("progressbar", { name: "Uploading selected media" });
  expect(progress.closest("li")?.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  expect(screen.queryByText("private-cut.mp4")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
  await screen.findByRole("alert");
});
it("retains a cancelled video draft and retries the upload", async () => {
  let attempt = 0;
  mocks.upload.mockImplementation((_client, input) => {
    attempt += 1;
    if (attempt > 1) return Promise.resolve("media-1");
    return new Promise((_resolve, reject) => {
      input.signal.addEventListener("abort", () => reject(new Error("Upload cancelled.")), {
        once: true,
      });
    });
  });
  render(<Composer />);
  openComposer();
  fireEvent.change(screen.getByLabelText("Choose post photos or videos"), {
    target: { files: [new File(["video bytes"], "walkthrough.mp4", { type: "video/mp4" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
  fireEvent.click(await screen.findByRole("button", { name: "Cancel upload" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Video preview 1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry publishing" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.upload).toHaveBeenCalledTimes(2);
});
