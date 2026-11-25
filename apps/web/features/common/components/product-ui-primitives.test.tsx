// @vitest-environment jsdom

import { MilestoneTimeline } from "@repo/ui/components/ui/milestone-timeline";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IFormStep } from "./form/form-stepper";

import { FormStepTabs } from "./form/form-stepper";
import { StatusText } from "./status-text";

const steps: readonly IFormStep[] = [
  { id: "details", title: "Details", hint: "Describe the work." },
  { id: "budget", title: "Budget", hint: "Set a budget." },
  { id: "review", title: "Review", hint: "Check the job." },
];

describe("product UI primitives", () => {
  afterEach(cleanup);

  it("moves through form steps with arrow keys and reports progress", () => {
    const onSelect = vi.fn();
    render(<FormStepTabs steps={steps} activeIndex={0} onSelect={onSelect} idPrefix="job-form" />);

    const activeTab = screen.getByRole("tab", { name: /Details/ });
    expect(activeTab.tabIndex).toBe(0);
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });

    expect(onSelect).toHaveBeenCalledWith(1);
    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeCloseTo(
      33.333,
      2,
    );
  });

  it("renders statuses as labeled semantic color badges", () => {
    render(<StatusText tone="success">Published</StatusText>);

    const badge = screen.getByText("Published");
    expect(badge.getAttribute("data-tone")).toBe("success");
    expect(badge.className).toContain("bg-emerald-50");
  });

  it("keeps timeline content in supplied order with named states", () => {
    render(
      <MilestoneTimeline
        items={[
          { id: "first", state: "complete", content: <p>Requirements approved</p> },
          { id: "second", state: "active", content: <p>Core logic audit</p> },
        ]}
      />,
    );

    const timeline = screen.getByRole("list", { name: "Project milestones" });
    expect(timeline.children).toHaveLength(2);
    expect(screen.getByText("Requirements approved")).toBeTruthy();
    expect(screen.getByText("Core logic audit")).toBeTruthy();
  });
});
