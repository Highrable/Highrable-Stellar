// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";

const runtime = vi.hoisted(() => ({
  mode: "freelancer" as "freelancer" | "client",
  role: "freelancer" as "freelancer" | "client",
  isRoleLoading: false,
  isConnected: true,
  isTestnet: false,
  isFunded: true,
  isLoading: false,
  summary: {
    totalEarnedByAsset: [{ asset: "USDC", amount: 125 }],
    pendingEscrowByAsset: [{ asset: "USDC", amount: 75 }],
    activeJobs: 2,
    awaitingFunding: 3,
    completedJobs: 4,
    recentPayouts: [],
  },
  notifications: {
    walletAddress: "GTEST",
    rows: [
      {
        _id: "notification-1",
        title: "Deadline missed",
        body: "This micro gig is now overdue.",
        createdAt: 1_800_000_000_000,
        readAt: null,
      },
    ],
    unreadCount: 1,
    markAllRead: vi.fn(),
  },
}));

vi.mock("@/core/wallet/components/wallet-required-notice", () => ({
  WalletRequiredNotice: () => createElement("div", null, "Connect wallet"),
}));
vi.mock("@/features/admin", () => ({ AdminDashboardEntry: () => null }));
vi.mock("@/features/common", () => ({
  ProductPageHero: ({
    title,
    description,
    actions,
  }: {
    title: string;
    description: string;
    actions: ReactNode;
  }) =>
    createElement(
      "header",
      null,
      createElement("h1", null, title),
      createElement("p", null, description),
      actions,
    ),
  RouteCallout: ({ children }: { children: ReactNode }) =>
    createElement("div", { role: "status" }, children),
  StatCard: ({ label, value }: { label: string; value: ReactNode }) =>
    createElement("div", { "data-testid": `stat-${label}` }, label, ": ", value),
}));
vi.mock("@/features/dashboard/components/applied-jobs-section", () => ({
  AppliedJobsSection: () => createElement("p", null, "Applications list"),
}));
vi.mock("@/features/dashboard/components/ongoing-jobs-section", () => ({
  OngoingJobsSection: () => createElement("p", null, "In progress list"),
}));
vi.mock("@/features/dashboard/components/posted-jobs-section", () => ({
  PostedJobsSection: () =>
    createElement("section", { "aria-label": "Posted jobs surface" }, "Posted jobs"),
}));
vi.mock("@/features/dashboard/components/recent-payouts-list", () => ({
  RecentPayoutsList: () => createElement("p", null, "Payments received list"),
}));
vi.mock("@/features/dashboard/components/registry-registration-card", () => ({
  RegistryRegistrationCard: () => null,
}));
vi.mock("@/features/dashboard/hooks/use-dashboard-role", () => ({
  useDashboardRole: () => ({ role: runtime.role, isLoading: runtime.isRoleLoading }),
}));
vi.mock("@/features/dashboard/hooks/use-freelancer-dashboard", () => ({
  useFreelancerDashboard: () => ({
    summary: runtime.summary,
    isLoading: runtime.isLoading,
    isConnected: runtime.isConnected,
    isTestnet: runtime.isTestnet,
    isFunded: runtime.isFunded,
  }),
}));
vi.mock("@/features/deadlines", () => ({
  useDeadlineNotifications: () => runtime.notifications,
  DeadlineNotificationsPanel: ({ state }: { state: typeof runtime.notifications }) =>
    createElement(
      "section",
      { "aria-label": "Deadline reminders" },
      createElement("p", null, `${state.unreadCount} unread`),
      createElement("button", { onClick: state.markAllRead }, "Mark all read"),
    ),
}));
vi.mock("@/features/mode", () => ({
  useAppMode: () => ({ mode: runtime.mode, isReady: true }),
}));
vi.mock("@/features/onboarding", () => ({
  useRequireOnboarding: () => ({ isCheckingOnboarding: false, isOnboardingComplete: true }),
}));
vi.mock("@repo/ui/components/ui/button", () => ({
  Button: ({ children, asChild, ...props }: { children: ReactNode; asChild?: boolean }) =>
    createElement(asChild ? "span" : "button", props, children),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

import { DashboardPage } from "./dashboard-page";

describe("DashboardPage", () => {
  beforeEach(() => {
    runtime.mode = "freelancer";
    runtime.role = "freelancer";
    runtime.isRoleLoading = false;
    runtime.isConnected = true;
    runtime.isTestnet = false;
    runtime.isFunded = true;
    runtime.isLoading = false;
    runtime.notifications.markAllRead.mockReset();
    runtime.notifications.rows = [
      {
        _id: "notification-1",
        title: "Deadline missed",
        body: "This micro gig is now overdue.",
        createdAt: 1_800_000_000_000,
        readAt: null,
      },
    ];
    runtime.notifications.unreadCount = 1;
  });

  afterEach(cleanup);

  it("shows freelancer amounts, counts, reminders, and keyboard-operable work tabs", async () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "My work" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Find work" }).getAttribute("href")).toBe(
      "/marketplace",
    );
    expect(screen.getByTestId("stat-Total earned").textContent).toContain("125 USDC");
    expect(screen.getByTestId("stat-On hold for you").textContent).toContain("75 USDC");
    expect(screen.getByTestId("stat-In progress").textContent).toContain("2");
    expect(screen.getByTestId("stat-Awaiting funding").textContent).toContain("3");
    expect(screen.getByTestId("stat-Finished").textContent).toContain("4");
    expect(screen.getByRole("region", { name: "Deadline reminders" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Your work" }).parentElement?.className).toContain(
      "lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.9fr)]",
    );

    const applicationsTab = screen.getByRole("tab", { name: "Applications" });
    const inProgressTab = screen.getByRole("tab", { name: "In progress" });
    expect(applicationsTab.getAttribute("aria-selected")).toBe("true");
    expect(applicationsTab.tagName).toBe("BUTTON");
    expect(inProgressTab.tagName).toBe("BUTTON");
    expect(screen.getByRole("tab", { name: "Payments received" })).toBeTruthy();
    applicationsTab.focus();
    fireEvent.keyDown(applicationsTab, { key: "ArrowRight" });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "In progress" }).getAttribute("aria-selected")).toBe(
        "true",
      );
    });
  });

  it("shows the client reminder and posted-jobs surface without freelancer metrics", () => {
    runtime.mode = "client";
    runtime.role = "client";

    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "My jobs" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Post a job" }).getAttribute("href")).toBe("/post-job");
    expect(screen.getByRole("region", { name: "Deadline reminders" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Posted jobs surface" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Earnings summary" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(runtime.notifications.markAllRead).toHaveBeenCalledOnce();
  });

  it("keeps reminders hidden and lets work fill the row when there are none", () => {
    runtime.notifications.rows = [];
    runtime.notifications.unreadCount = 0;

    render(<DashboardPage />);

    expect(screen.queryByRole("region", { name: "Deadline reminders" })).toBeNull();
    expect(screen.getByRole("region", { name: "Earnings summary" }).className).toContain(
      "xl:grid-cols-5",
    );
    expect(screen.getByRole("region", { name: "Your work" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Your work" }).parentElement?.className).toContain(
      "grid-cols-1",
    );
  });

  it("keeps the five-card layout while the freelancer summary is loading", () => {
    runtime.isLoading = true;

    const { container } = render(<DashboardPage />);
    const summarySkeleton = container.querySelector('[aria-hidden="true"]');

    expect(summarySkeleton?.children).toHaveLength(5);
    expect(screen.queryByRole("region", { name: "Earnings summary" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Applications" })).toBeTruthy();
  });
});
