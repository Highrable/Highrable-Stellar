// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import AdminDisputeDetailLoading from "./admin/disputes/[disputeId]/loading";
import AdminDisputesLoading from "./admin/disputes/loading";
import RootLoading from "./loading";

afterEach(cleanup);

describe("route loading fallbacks", () => {
  it.each([
    [RootLoading, "Loading page..."],
    [AdminDisputesLoading, "Loading dispute queue..."],
    [AdminDisputeDetailLoading, "Loading dispute detail..."],
  ])("announces %s", (LoadingFallback, label) => {
    render(<LoadingFallback />);

    expect(screen.getByRole("status").textContent).toBe(label);
  });
});
