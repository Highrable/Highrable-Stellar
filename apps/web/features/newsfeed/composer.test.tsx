import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { Composer } from "./composer";
const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  upload: vi.fn(),
  viewer: { _id: "user-1" } as object | null,
}));
vi.mock("convex/react", () => ({ useConvex: () => ({ mutation: mocks.mutation }) }));
vi.mock("./session", () => ({
  useSocialSession: () => ({ token: "verified-session", viewer: mocks.viewer }),
}));
vi.mock("./media-client", () => ({ uploadMedia: mocks.upload }));
beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.viewer = { _id: "user-1" };
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
it("retains text after publication failure and retries the same post without duplicating uploads", async () => {
  let publishCalls = 0;
  mocks.mutation.mockImplementation(async (ref: Parameters<typeof getFunctionName>[0]) => {
    if (getFunctionName(ref).endsWith(":publish") && ++publishCalls === 1)
      throw new Error("Connection lost");
    return "post-1";
  });
  render(<Composer />);
  fireEvent.change(screen.getByRole("textbox", { name: "Share an update" }), {
    target: { value: "An intact draft 🌏" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await screen.findByRole("alert");
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("An intact draft 🌏");
  fireEvent.click(screen.getByRole("button", { name: "Retry publishing" }));
  await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(""));
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  const begins = mocks.mutation.mock.calls.filter(([ref]) =>
    getFunctionName(ref).endsWith(":beginPost"),
  );
  expect(begins).toHaveLength(1);
});
it("does not expose publishing controls to an unverified participant", () => {
  mocks.viewer = null;
  render(<Composer />);
  expect(screen.queryByRole("textbox")).toBeNull();
});
it("retains text after an upload failure and does not publish broken media", async () => {
  mocks.upload.mockRejectedValue(new Error("Upload failed"));
  render(<Composer />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep this content" } });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await screen.findByRole("alert");
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep this content");
  expect(
    mocks.mutation.mock.calls.filter(([ref]) => getFunctionName(ref).endsWith(":publish")),
  ).toHaveLength(0);
});
