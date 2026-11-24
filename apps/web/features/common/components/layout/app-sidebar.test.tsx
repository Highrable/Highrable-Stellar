// @vitest-environment jsdom

import { SidebarProvider } from "@repo/ui/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AppSidebar } from "./app-sidebar";

const connectedWallet = `G${"A".repeat(55)}`;
const otherWallet = `G${"B".repeat(55)}`;

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/disputes/case-1",
}));
vi.mock("@/features/mode", () => ({
  useAppMode: () => ({ mode: "client" }),
}));
vi.mock("@/core/wallet/hooks/use-highrable-wallet-identity", () => ({
  useHighrableWalletIdentity: () => ({ activeWalletMode: "external_wallet", isConnected: true }),
}));
vi.mock("@/core/wallet/hooks/use-wallet", () => ({
  useWallet: () => ({
    authSession: null,
    walletState: { isConnected: true, walletAddress: connectedWallet },
  }),
}));
vi.mock("@/core/wallet/passkey-smart-account-context", () => ({
  usePasskeySmartAccount: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([
  { adminWallet: connectedWallet, isOwner: true, showsOwnerLinks: true },
  { adminWallet: connectedWallet, isOwner: false, showsOwnerLinks: false },
  { adminWallet: otherWallet, isOwner: true, showsOwnerLinks: false },
])(
  "renders admin links for the verified session %#",
  async ({ adminWallet, isOwner, showsOwnerLinks }) => {
    const fetchSession = vi
      .fn()
      .mockResolvedValue(Response.json({ adminWallet, isOwner, isDisputeAdmin: true }));
    vi.stubGlobal("fetch", fetchSession);
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Disputes" }).getAttribute("href")).toBe(
      "/admin/disputes",
    );
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Admins" })).toBeNull();

    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
      expect(Boolean(screen.queryByRole("link", { name: "Overview" }))).toBe(showsOwnerLinks);
      expect(Boolean(screen.queryByRole("link", { name: "Admins" }))).toBe(showsOwnerLinks);
    });
    expect(fetchSession).toHaveBeenCalledTimes(1);
    expect(fetchSession).toHaveBeenCalledWith("/api/admin/session", expect.anything());
  },
);
