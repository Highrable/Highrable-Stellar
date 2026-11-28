// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

const { usePathname, useHighrableWalletIdentity, push } = vi.hoisted(() => ({
  usePathname: vi.fn<() => string>(),
  useHighrableWalletIdentity: vi.fn<() => { isConnected: boolean }>(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname, useRouter: () => ({ push }) }));
vi.mock("@/core/wallet/hooks/use-highrable-wallet-identity", () => ({
  useHighrableWalletIdentity,
}));
vi.mock("@/core/wallet/components/wallet-connect-trigger", () => ({
  WalletConnectTrigger: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock("@repo/ui/components/highrable/theme-toggle", () => ({
  ThemeToggle: () => null,
}));
vi.mock("@/features/mode", async () => {
  const { MODE_NAVIGATION } = await import("@/features/mode/mode-config");
  return {
    MODE_NAVIGATION,
    AppModeProvider: ({ children }: { children: React.ReactNode }) => children,
    ModeBanner: () => null,
    useAppMode: () => ({ mode: "client" }),
  };
});
vi.mock("./app-sidebar", () => ({
  AppSidebar: () => <nav aria-label="App sidebar" />,
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  useHighrableWalletIdentity.mockReturnValue({ isConnected: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(["/marketplace", "/marketplace/jobs/job-1", "/post-job"])(
  "keeps %s and wallet connection accessible without guest sidebar controls",
  (pathname) => {
    usePathname.mockReturnValue(pathname);

    render(<AppShell>Page content</AppShell>);

    expect(screen.getByText("Page content")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "App sidebar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Toggle navigation sidebar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open messages" })).toBeNull();
    expect(fireEvent.keyDown(window, { key: "b", ctrlKey: true })).toBe(true);
  },
);

it("restores sidebar controls after connection without remounting the page", () => {
  usePathname.mockReturnValue("/post-job");
  const page = (
    <AppShell>
      <input aria-label="Job title" />
    </AppShell>
  );
  const { rerender } = render(page);
  const jobTitle = screen.getByRole<HTMLInputElement>("textbox", { name: "Job title" });
  fireEvent.change(jobTitle, { target: { value: "My draft" } });

  useHighrableWalletIdentity.mockReturnValue({ isConnected: true });
  rerender(
    <AppShell>
      <input aria-label="Job title" />
    </AppShell>,
  );

  expect(screen.getByRole("navigation", { name: "App sidebar" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Toggle navigation sidebar" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open messages" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Job title" })).toBe(jobTitle);
  expect(jobTitle.value).toBe("My draft");
});

it("preserves the existing sidebar on other routes", () => {
  usePathname.mockReturnValue("/dashboard");

  render(<AppShell>Page content</AppShell>);

  expect(screen.getByRole("navigation", { name: "App sidebar" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Toggle navigation sidebar" })).toBeTruthy();
});
