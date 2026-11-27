import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

const setMode = vi.fn();

vi.mock("./mode-provider", () => ({
  useAppMode: () => ({ mode: "freelancer", setMode, isReady: true }),
}));

import { ModeSwitch } from "./mode-switch";

afterEach(() => {
  cleanup();
  setMode.mockReset();
});

it("keeps both mode destinations discoverable and exposes the selected state", () => {
  render(<ModeSwitch size="large" fullWidth />);

  expect(screen.getByRole("radiogroup")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Freelancer" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  expect(screen.getByRole("radio", { name: "Client" }).getAttribute("aria-checked")).toBe("false");

  fireEvent.click(screen.getByRole("radio", { name: "Client" }));
  expect(setMode).toHaveBeenCalledWith("client");
});
