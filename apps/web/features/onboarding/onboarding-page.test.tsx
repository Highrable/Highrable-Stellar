// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  avatarUpload: vi.fn(),
  email: "saved@example.com" as string | null | undefined,
  identity: {
    isConnected: true,
    walletAddress: `G${"B".repeat(55)}`,
    walletType: "external_wallet" as const,
  },
  onboardingState: {
    exists: true,
    isComplete: false,
    user: {
      firstName: "Saved",
      lastName: "Profile",
      publicHandle: "saved-profile",
      coreSkills: ["Stellar"],
      discordHandle: "savedDiscord",
      role: undefined as "client" | "freelancer" | "admin" | undefined,
    },
    avatarUrl: null as string | null,
  } as {
    exists: boolean;
    isComplete: boolean;
    user: Record<string, unknown> | null;
    avatarUrl: string | null;
  },
  register: vi.fn(),
  checkRegistration: vi.fn(),
  routerReplace: vi.fn(),
  savePrivateEmail: vi.fn(),
  saveProfileDraft: vi.fn(),
  search: "",
  setMode: vi.fn(),
  transaction: null as null | Record<string, unknown>,
  useQueryCalls: [] as Array<{ ref: string; args: unknown }>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: runtime.routerReplace }),
  useSearchParams: () => new URLSearchParams(runtime.search),
}));

vi.mock("@/core/wallet/hooks/use-highrable-wallet-identity", () => ({
  useHighrableWalletIdentity: () => runtime.identity,
}));

vi.mock("@/core/wallet/components/wallet-connect-trigger", () => ({
  WalletConnectTrigger: () => <button type="button">Connect wallet</button>,
}));

vi.mock("@/features/newsfeed/session", () => ({
  SocialSession: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSocialSession: () => ({ token: "verified-session", status: null }),
}));

vi.mock("@/features/mode", () => ({
  useAppMode: () => ({ mode: "freelancer", isReady: true, setMode: runtime.setMode }),
}));

vi.mock("@/features/onboarding/hooks/use-registry-registration", () => ({
  useRegistryRegistration: () => ({
    clearError: vi.fn(),
    configurationError: null,
    error: null,
    hasPendingTransaction: Boolean(runtime.transaction),
    isBusy: false,
    isLoading: false,
    register: runtime.register,
    checkRegistration: runtime.checkRegistration,
    stepLabel: null,
    transaction: runtime.transaction,
  }),
}));

vi.mock("@repo/convex-client", () => ({
  api: {
    attachments: { generateUploadUrl: "generateUploadUrl" },
    users: {
      getPrivateEmail: "getPrivateEmail",
      savePrivateEmail: "savePrivateEmail",
      saveProfileDraft: "saveProfileDraft",
      queries: { getOnboardingState: "getOnboardingState" },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: string) => {
    if (reference === "generateUploadUrl") return runtime.avatarUpload;
    if (reference === "savePrivateEmail") return runtime.savePrivateEmail;
    if (reference === "saveProfileDraft") return runtime.saveProfileDraft;
    throw new Error(`Unexpected mutation: ${reference}`);
  },
  useQuery: (reference: string, args: unknown) => {
    runtime.useQueryCalls.push({ ref: reference, args });
    if (reference === "getOnboardingState") return runtime.onboardingState;
    if (reference === "getPrivateEmail") return runtime.email;
    throw new Error(`Unexpected query: ${reference}`);
  },
}));

vi.mock("@/features/common", async () => {
  return {
    PageLoadingState: ({ label }: { label: string }) => <p>Loading {label}</p>,
    ProfileAvatar: ({ displayName }: { displayName: string }) => <span>{displayName}</span>,
    showErrorToast: vi.fn(),
    showWarningToast: vi.fn(),
    TermHint: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { OnboardingPage } from "./onboarding-page";

function resetRuntime() {
  runtime.avatarUpload.mockReset().mockResolvedValue("https://uploads.example.test");
  runtime.avatarUpload.mockImplementation(async () => "https://uploads.example.test");
  runtime.email = "saved@example.com";
  runtime.identity = {
    isConnected: true,
    walletAddress: `G${"B".repeat(55)}`,
    walletType: "external_wallet",
  };
  runtime.onboardingState = {
    exists: true,
    isComplete: false,
    user: {
      firstName: "Saved",
      lastName: "Profile",
      publicHandle: "saved-profile",
      coreSkills: ["Stellar"],
      discordHandle: "savedDiscord",
      role: undefined,
    },
    avatarUrl: null,
  };
  runtime.register.mockReset().mockResolvedValue(undefined);
  runtime.checkRegistration.mockReset();
  runtime.routerReplace.mockReset();
  runtime.savePrivateEmail.mockReset().mockResolvedValue("private-email-id");
  runtime.saveProfileDraft.mockReset().mockResolvedValue("user-id");
  runtime.search = "";
  runtime.setMode.mockReset();
  runtime.transaction = null;
  runtime.useQueryCalls = [];
}

async function openProfileDialog(role: "Client" | "Freelancer" = "Freelancer") {
  render(<OnboardingPage />);
  const roleChoice = await screen.findByRole("dialog", { name: "How will you use Highrable?" });
  const roleButton = await screen.findByRole("button", { name: new RegExp(role) });
  await waitFor(() => expect((roleButton as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(roleButton);
  await waitFor(() => expect(document.body.contains(roleChoice)).toBe(false));
  return await screen.findByRole("dialog", { name: "Set up your profile" });
}

function fillRequiredProfile() {
  fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Ada" } });
  fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Lovelace" } });
  fireEvent.change(screen.getByLabelText(/Username/), { target: { value: "ada-lovelace" } });
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "ada@example.com" } });
}

beforeEach(() => {
  resetRuntime();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ storageId: "storage-avatar" }),
    }),
  );
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:avatar-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("two-dialog account onboarding", () => {
  it.each([
    ["Freelancer", "freelancer"],
    ["Client", "client"],
  ] as const)("selects %s mode and opens the profile dialog", async (label, mode) => {
    const profileDialog = await openProfileDialog(label);
    expect(document.body.contains(profileDialog)).toBe(true);
    expect(runtime.setMode).toHaveBeenCalledWith(mode);
    expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe("Saved");
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("saved@example.com");
  });

  it("returns to role choice without losing values and supports keyboard focus", async () => {
    await openProfileDialog();
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Back to role choice" }));

    const freelancerButton = await screen.findByRole("button", { name: /Freelancer/ });
    expect(freelancerButton.tabIndex).toBeGreaterThanOrEqual(0);
    freelancerButton.focus();
    expect(document.activeElement).toBe(freelancerButton);
    fireEvent.click(screen.getByRole("button", { name: /Client/ }));
    expect(((await screen.findByLabelText(/First name/)) as HTMLInputElement).value).toBe("Ada");
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("saved@example.com");
    expect(runtime.setMode).toHaveBeenLastCalledWith("client");
  });

  it("shows required field errors and focuses the first invalid field", async () => {
    await openProfileDialog();
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "" } });
    const form = screen.getByRole("button", { name: "Save profile and finish" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    for (const message of [
      "First name is required.",
      "Last name is required.",
      "Username must be at least 3 characters.",
      "Email is required.",
    ]) {
      expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    }
    expect(screen.getByLabelText(/First name/).getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/First name/)));
    expect(runtime.register).not.toHaveBeenCalled();
  });

  it("retains avatar validation and uploads a valid optional image", async () => {
    await openProfileDialog();
    fillRequiredProfile();
    const avatarInput = screen.getByLabelText("Profile photo upload") as HTMLInputElement;
    fireEvent.change(avatarInput, {
      target: { files: [new File(["svg"], "avatar.svg", { type: "image/svg+xml" })] },
    });
    expect(await screen.findByText("Avatar must be a JPEG, PNG, WebP, or GIF image.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save profile and finish" }));
    await waitFor(() => expect(runtime.register).not.toHaveBeenCalled());

    fireEvent.change(avatarInput, {
      target: { files: [new File(["png"], "avatar.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile and finish" }));
    await waitFor(() => expect(runtime.register).toHaveBeenCalled());
    expect(runtime.avatarUpload).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/png", type: "image" }),
    );
    expect(runtime.savePrivateEmail).toHaveBeenCalledWith(
      expect.objectContaining({ sessionToken: "verified-session", email: "ada@example.com" }),
    );
  });

  it.each([
    ["Freelancer", "freelancer", "/marketplace?mode=freelancer"],
    ["Client", "client", "/dashboard?mode=client"],
  ] as const)(
    "routes completed %s accounts to its starting destination",
    async (label, role, destination) => {
      const view = render(<OnboardingPage />);
      const roleButton = await screen.findByRole("button", { name: new RegExp(label) });
      await waitFor(() => expect((roleButton as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(roleButton);
      await screen.findByRole("dialog", { name: "Set up your profile" });
      fillRequiredProfile();
      const form = screen.getByRole("button", { name: "Save profile and finish" }).closest("form");
      fireEvent.submit(form!);
      await waitFor(() => expect(runtime.register).toHaveBeenCalled());
      expect(runtime.saveProfileDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          role,
          coreSkills: ["Stellar"],
          discordHandle: "savedDiscord",
        }),
      );

      runtime.onboardingState = {
        exists: true,
        isComplete: true,
        user: { role },
        avatarUrl: null,
      };
      view.rerender(<OnboardingPage />);
      await waitFor(() => expect(runtime.routerReplace).toHaveBeenCalledWith(destination));
    },
  );

  it("bypasses both dialogs for an already completed account", async () => {
    runtime.onboardingState = {
      exists: true,
      isComplete: true,
      user: { role: "client" },
      avatarUrl: null,
    };
    runtime.search = "?next=%2Fdashboard%3Ftab%3Dactivity";
    render(<OnboardingPage />);

    await waitFor(() =>
      expect(runtime.routerReplace).toHaveBeenCalledWith("/dashboard?tab=activity"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the registration recovery action inside the profile dialog", async () => {
    runtime.transaction = { status: "pending" };
    await openProfileDialog();
    fireEvent.click(screen.getByRole("button", { name: "Check my registration" }));
    expect(runtime.checkRegistration).toHaveBeenCalledWith({ completeOnboarding: true });
  });
});
