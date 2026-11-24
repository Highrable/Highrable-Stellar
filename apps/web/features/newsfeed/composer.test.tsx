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
  fireEvent.click(screen.getByRole("button", { name: "Open post composer" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Publish Update" }));
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
it("requires public milestone confirmation and submits normalized tags", async () => {
  mocks.milestones = [
    { id: "milestone-1", title: "Design system delivery", status: "released", jobId: "job-1" },
  ];
  render(<Composer />);
  openComposer();
  fireEvent.change(screen.getByRole("textbox", { name: "Share an update" }), {
    target: { value: "A milestone update" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /Tags/i }), {
    target: { value: "#Figma, DesignSystems" },
  });
  fireEvent.change(screen.getByLabelText("Attach a milestone (optional)"), {
    target: { value: "milestone-1" },
  });
  const publish = screen.getByRole("button", { name: "Publish Update" });
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
  fireEvent.click(screen.getByRole("button", { name: "Publish Update" }));
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
  expect(screen.getByText("photo-edited.webp")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Publish Update" }));
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
  expect(screen.getByText("walkthrough.mp4")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit image" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Publish Update" }));
  await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
  expect(mocks.upload.mock.calls[0]?.[1].file).toBe(video);
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
  fireEvent.click(screen.getByRole("button", { name: "Publish Update" }));
  fireEvent.click(await screen.findByRole("button", { name: "Cancel upload" }));
  await screen.findByRole("alert");
  expect(screen.getByText("walkthrough.mp4")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry publishing" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.upload).toHaveBeenCalledTimes(2);
});
