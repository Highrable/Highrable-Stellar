// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PageLoadingState } from "./page-loading-state";

afterEach(cleanup);

describe("PageLoadingState", () => {
  it("announces the loading label and renders both artwork layers", () => {
    const { container } = render(<PageLoadingState label="payment proof" />);
    const status = screen.getByRole("status");
    const images = Array.from(container.querySelectorAll("img"));

    expect(status.textContent).toBe("Loading payment proof...");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(images).toHaveLength(4);
    expect(images.filter((image) => image.src.endsWith("handshake-left.png"))).toHaveLength(2);
    expect(images.filter((image) => image.src.endsWith("handshake-right.png"))).toHaveLength(2);
    expect(images.every((image) => image.alt === "")).toBe(true);
  });
});
