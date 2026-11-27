"use client";

import { WalletConnectTrigger } from "@/core/wallet/components/wallet-connect-trigger";
import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import {
  PageLoadingState,
  ProfileAvatar,
  showErrorToast,
  showWarningToast,
  TermHint,
} from "@/features/common";
import { getReadableErrorMessage } from "@/features/marketplace/lib/errors";
import { useAppMode, type TAppMode } from "@/features/mode";
import { useSocialSession, SocialSession } from "@/features/newsfeed/session";
import { useRegistryRegistration } from "@/features/onboarding/hooks/use-registry-registration";
import {
  TOnboardingFormSchema,
  type TOnboardingFormValues,
  type TSanitizedOnboardingFormValues,
} from "@/features/onboarding/types";
import {
  buildProfileIdentityMutationArgs,
  parseSkillsInput,
  validateAvatarFile,
} from "@/features/profile/lib/profile-identity-form";
import { api, type TConvexStorageId } from "@repo/convex-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui-customs/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useMutation, useQuery } from "convex/react";
import { BriefcaseBusiness, Search, Upload } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as React from "react";

import type { FunctionReturnType } from "convex/server";

const EMPTY_FORM_VALUES: TOnboardingFormValues = {
  firstName: "",
  middleName: "",
  lastName: "",
  publicHandle: "",
  coreSkills: [],
  discordHandle: "",
  xHandle: "",
  githubUsername: "",
  email: "",
};

type TDialogStep = "role" | "profile";
type TOnboardingTextField =
  | "firstName"
  | "lastName"
  | "publicHandle"
  | "email"
  | "middleName"
  | "discordHandle"
  | "xHandle"
  | "githubUsername";
type TFieldErrors = Partial<Record<TOnboardingTextField, string>>;
type TOnboardingState = FunctionReturnType<typeof api.users.queries.getOnboardingState>;

const FIELD_IDS: Record<TOnboardingTextField, string> = {
  firstName: "onboarding-first-name",
  lastName: "onboarding-last-name",
  publicHandle: "onboarding-username",
  email: "onboarding-email",
  middleName: "onboarding-middle-name",
  discordHandle: "onboarding-discord",
  xHandle: "onboarding-x",
  githubUsername: "onboarding-github",
};

function getRoleDestination(role: TAppMode): string {
  return role === "client" ? "/dashboard?mode=client" : "/marketplace?mode=freelancer";
}

export function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const walletIdentity = useHighrableWalletIdentity();
  const onboardingState = useQuery(
    api.users.queries.getOnboardingState,
    walletIdentity.walletAddress ? { walletAddress: walletIdentity.walletAddress } : "skip",
  );
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const safeNextPath =
    nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
  const isAdmin = onboardingState?.user?.role === "admin";
  const isComplete = Boolean(onboardingState?.isComplete || isAdmin);
  const isLoading = walletIdentity.isConnected && onboardingState === undefined;
  const [hasStartedIncomplete, setHasStartedIncomplete] = useState(false);

  useEffect(() => {
    if (!isLoading && walletIdentity.isConnected && onboardingState && !isComplete) {
      setHasStartedIncomplete(true);
    }
  }, [isComplete, isLoading, onboardingState, walletIdentity.isConnected]);

  useEffect(() => {
    if (!isComplete) return;
    const role = onboardingState?.user?.role;
    const destination =
      hasStartedIncomplete && (role === "client" || role === "freelancer")
        ? getRoleDestination(role)
        : safeNextPath;
    router.replace(destination);
  }, [hasStartedIncomplete, isComplete, onboardingState?.user?.role, router, safeNextPath]);

  if (!walletIdentity.isConnected) {
    return (
      <main className="mx-auto max-w-2xl space-y-5">
        <header>
          <h1 className="hr-text-primary text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="hr-text-secondary mt-1 text-sm">
            Connect a wallet or passkey account to choose how you want to use Highrable.
          </p>
        </header>
        <WalletConnectTrigger className="hr-v2-button-primary rounded-md px-4 py-2 text-sm" />
      </main>
    );
  }

  if (isLoading || isComplete || !onboardingState) {
    return <PageLoadingState label="onboarding" />;
  }

  return (
    <SocialSession>
      <OnboardingDialogs onboardingState={onboardingState} />
    </SocialSession>
  );
}

function OnboardingDialogs({ onboardingState }: { readonly onboardingState: TOnboardingState }) {
  const walletIdentity = useHighrableWalletIdentity();
  const { token, status: sessionStatus } = useSocialSession();
  const { setMode } = useAppMode();
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const saveProfileDraft = useMutation(api.users.saveProfileDraft);
  const savePrivateEmail = useMutation(api.users.savePrivateEmail);
  const registration = useRegistryRegistration();
  const emailQuery = useQuery(
    api.users.getPrivateEmail,
    token && walletIdentity.walletAddress
      ? { sessionToken: token, walletAddress: walletIdentity.walletAddress }
      : "skip",
  );
  const [values, setValues] = useState<TOnboardingFormValues>(EMPTY_FORM_VALUES);
  const [skillsInput, setSkillsInput] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<TAppMode | null>(null);
  const [dialogStep, setDialogStep] = useState<TDialogStep>("role");
  const [isDialogOpen, setIsDialogOpen] = useState(true);
  const [isPreparingProfile, setIsPreparingProfile] = useState(false);
  const [restoredWallet, setRestoredWallet] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const isBusy = isPreparingProfile || registration.isBusy;
  const isDraftReady = Boolean(
    token &&
    walletIdentity.walletAddress &&
    onboardingState.exists &&
    emailQuery !== undefined &&
    restoredWallet === walletIdentity.walletAddress,
  );

  useEffect(() => {
    if (!walletIdentity.walletAddress) {
      setRestoredWallet(null);
      return;
    }
    if (!token) {
      return;
    }
    if (
      !onboardingState.exists ||
      emailQuery === undefined ||
      restoredWallet === walletIdentity.walletAddress
    ) {
      return;
    }

    const user = onboardingState.user;
    const restoredRole = user?.role === "client" || user?.role === "freelancer" ? user.role : null;
    const coreSkills = user?.coreSkills ?? user?.skills ?? [];
    setValues({
      firstName: user?.firstName ?? "",
      middleName: user?.middleName ?? "",
      lastName: user?.lastName ?? "",
      publicHandle: user?.publicHandle ?? "",
      coreSkills,
      discordHandle: user?.discordHandle ?? "",
      xHandle: user?.xHandle ?? "",
      githubUsername: user?.githubUsername ?? "",
      email: emailQuery ?? "",
    });
    setSkillsInput(coreSkills.join(", "));
    setAvatarFile(null);
    setAvatarError(null);
    setFormError(null);
    setFieldErrors({});
    setSelectedRole(restoredRole);
    setDialogStep(restoredRole ? "profile" : "role");
    if (restoredRole) setMode(restoredRole);
    registration.clearError();
    setRestoredWallet(walletIdentity.walletAddress);
  }, [
    emailQuery,
    onboardingState,
    registration.clearError,
    restoredWallet,
    setMode,
    token,
    walletIdentity.walletAddress,
  ]);

  useEffect(() => {
    if (!avatarFile) return;
    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  const displayName = useMemo(
    () => [values.firstName, values.lastName].filter(Boolean).join(" "),
    [values.firstName, values.lastName],
  );

  function selectRole(role: TAppMode) {
    setSelectedRole(role);
    setMode(role);
    setDialogStep("profile");
    setIsDialogOpen(true);
  }

  function setField(field: TOnboardingTextField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
    registration.clearError();
  }

  async function uploadAvatar(): Promise<TConvexStorageId | undefined> {
    if (!avatarFile || !walletIdentity.walletAddress) return undefined;

    const validationError = validateAvatarFile(avatarFile);
    if (validationError) throw new Error(validationError);

    const uploadUrl = await generateUploadUrl({
      walletAddress: walletIdentity.walletAddress,
      ...(walletIdentity.walletType ? { walletType: walletIdentity.walletType } : {}),
      name: avatarFile.name,
      size: avatarFile.size,
      mimeType: avatarFile.type,
      type: "image",
    });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": avatarFile.type },
      body: avatarFile,
    });
    if (!response.ok) throw new Error("Avatar upload failed.");
    const body = (await response.json()) as { storageId: TConvexStorageId };
    return body.storageId;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;
    setFormError(null);
    setFieldErrors({});
    registration.clearError();

    if (!walletIdentity.walletAddress || !token) {
      const message = "Finish signing in with your wallet or passkey before saving your profile.";
      setFormError(message);
      showWarningToast(message);
      return;
    }
    if (!selectedRole) {
      const message = "Choose Client or Freelancer to continue.";
      setFormError(message);
      showWarningToast(message);
      return;
    }
    if (avatarError) {
      setFormError(avatarError);
      showWarningToast(avatarError);
      return;
    }

    const parsed = TOnboardingFormSchema.safeParse({
      ...values,
      coreSkills: parseSkillsInput(skillsInput),
    });
    if (!parsed.success) {
      const nextErrors: TFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && field in FIELD_IDS) {
          const textField = field as TOnboardingTextField;
          nextErrors[textField] ??= issue.message;
        }
      }
      setFieldErrors(nextErrors);
      const firstInvalidField = Object.keys(nextErrors)[0] as TOnboardingTextField | undefined;
      if (firstInvalidField) {
        document.getElementById(FIELD_IDS[firstInvalidField])?.focus();
      }
      const message = Object.values(nextErrors)[0] ?? "Check your account details.";
      setFormError(message);
      showWarningToast(message);
      return;
    }

    setIsPreparingProfile(true);
    try {
      const profileDraft = buildProfileIdentityMutationArgs(
        parsed.data as TSanitizedOnboardingFormValues,
        undefined,
      );
      const profileDraftWithRole = { ...profileDraft, role: selectedRole };
      await savePrivateEmail({
        sessionToken: token,
        walletAddress: walletIdentity.walletAddress,
        email: parsed.data.email,
      });
      await saveProfileDraft({
        walletAddress: walletIdentity.walletAddress,
        ...(walletIdentity.walletType ? { walletType: walletIdentity.walletType } : {}),
        ...profileDraftWithRole,
      });
      const avatarStorageId = await uploadAvatar();
      await registration.register({
        profileDraft: {
          ...buildProfileIdentityMutationArgs(
            parsed.data as TSanitizedOnboardingFormValues,
            avatarStorageId,
          ),
          role: selectedRole,
        },
        completeOnboarding: true,
      });
    } catch (caughtError) {
      const message = getReadableErrorMessage(caughtError, "Could not complete onboarding.");
      setFormError(message);
      showErrorToast(message);
    } finally {
      setIsPreparingProfile(false);
    }
  }

  function collectRegistrationCheck() {
    setFormError(null);
    setFieldErrors({});
    void registration.checkRegistration({ completeOnboarding: true });
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open && isBusy) return;
    setIsDialogOpen(open);
  }

  function fieldError(field: TOnboardingTextField) {
    const message = fieldErrors[field];
    return message ? (
      <p id={`${FIELD_IDS[field]}-error`} role="alert" className="text-xs text-red-700">
        {message}
      </p>
    ) : null;
  }

  function fieldA11y(field: TOnboardingTextField) {
    return {
      "aria-invalid": Boolean(fieldErrors[field]),
      ...(fieldErrors[field] ? { "aria-describedby": `${FIELD_IDS[field]}-error` } : {}),
    };
  }

  return (
    <main className="mx-auto max-w-3xl">
      {!isDialogOpen ? (
        <section
          className="hr-card-surface space-y-3 p-6"
          aria-labelledby="resume-onboarding-title"
        >
          <h1 id="resume-onboarding-title" className="hr-text-primary text-xl font-semibold">
            Continue account setup
          </h1>
          <p className="hr-text-secondary text-sm">
            Your details stay in this form while you pause.
          </p>
          <Button onClick={() => setIsDialogOpen(true)} className="hr-v2-button-primary rounded-md">
            Continue setup
          </Button>
        </section>
      ) : null}

      <Dialog open={isDialogOpen && dialogStep === "role"} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="hr-card-surface max-h-[min(90dvh,48rem)] max-w-2xl overflow-y-auto">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="hr-text-primary text-2xl tracking-tight">
              How will you use Highrable?
            </DialogTitle>
            <DialogDescription className="hr-text-secondary leading-relaxed">
              Choose where you want to start. You can switch between both modes later.
            </DialogDescription>
          </DialogHeader>

          {!isDraftReady ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              {sessionStatus ?? <p role="status">Preparing your saved profile…</p>}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!isDraftReady}
              aria-pressed={selectedRole === "freelancer"}
              onClick={() => selectRole("freelancer")}
              className="group rounded-xl border border-border p-5 text-left transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Search className="mb-4 size-6 text-primary" aria-hidden="true" />
              <span className="hr-text-primary block text-lg font-semibold">Freelancer</span>
              <span className="hr-text-secondary mt-1 block text-sm">
                Find work, send proposals, and get paid for your skills.
              </span>
            </button>
            <button
              type="button"
              disabled={!isDraftReady}
              aria-pressed={selectedRole === "client"}
              onClick={() => selectRole("client")}
              className="group rounded-xl border border-border p-5 text-left transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <BriefcaseBusiness className="mb-4 size-6 text-primary" aria-hidden="true" />
              <span className="hr-text-primary block text-lg font-semibold">Client</span>
              <span className="hr-text-secondary mt-1 block text-sm">
                Post work, meet freelancers, and manage projects.
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your wallet or passkey stays connected for either role.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen && dialogStep === "profile"} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="hr-card-surface max-h-[min(92dvh,54rem)] max-w-2xl overflow-y-auto">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="hr-text-primary text-2xl tracking-tight">
              Set up your profile
            </DialogTitle>
            <DialogDescription className="hr-text-secondary leading-relaxed">
              {selectedRole === "client" ? "Client" : "Freelancer"} profile · Step 2 of 2. You can
              update these details later.
            </DialogDescription>
          </DialogHeader>

          {!isDraftReady ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              {sessionStatus ?? <p role="status">Preparing your saved profile…</p>}
            </div>
          ) : null}

          <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={FIELD_IDS.firstName}>
                  First name <RequiredMark />
                </Label>
                <Input
                  id={FIELD_IDS.firstName}
                  autoComplete="given-name"
                  placeholder="e.g. Ada"
                  maxLength={60}
                  required
                  {...fieldA11y("firstName")}
                  value={values.firstName}
                  onChange={(event) => setField("firstName", event.target.value)}
                />
                {fieldError("firstName")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={FIELD_IDS.lastName}>
                  Last name <RequiredMark />
                </Label>
                <Input
                  id={FIELD_IDS.lastName}
                  autoComplete="family-name"
                  placeholder="e.g. Lovelace"
                  maxLength={60}
                  required
                  {...fieldA11y("lastName")}
                  value={values.lastName}
                  onChange={(event) => setField("lastName", event.target.value)}
                />
                {fieldError("lastName")}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={FIELD_IDS.publicHandle}>
                  Username <RequiredMark />
                </Label>
                <Input
                  id={FIELD_IDS.publicHandle}
                  autoComplete="username"
                  placeholder="e.g. ada-lovelace"
                  maxLength={32}
                  required
                  {...fieldA11y("publicHandle")}
                  value={values.publicHandle}
                  onChange={(event) => setField("publicHandle", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  3–32 characters: letters, numbers, underscores, and hyphens.
                </p>
                {fieldError("publicHandle")}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={FIELD_IDS.email}>
                  Email <RequiredMark />
                </Label>
                <Input
                  id={FIELD_IDS.email}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  maxLength={254}
                  required
                  {...fieldA11y("email")}
                  value={values.email}
                  onChange={(event) => setField("email", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Your email is private and is not shown on your public profile.
                </p>
                {fieldError("email")}
              </div>
            </div>

            <section aria-labelledby="onboarding-avatar-title" className="space-y-2">
              <h3 id="onboarding-avatar-title" className="hr-text-primary text-sm font-semibold">
                Profile photo <span className="font-normal text-muted-foreground">(optional)</span>
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                  {avatarFile && avatarPreviewUrl ? (
                    <img
                      src={avatarPreviewUrl}
                      alt="New avatar preview"
                      className="size-full object-cover"
                    />
                  ) : onboardingState.avatarUrl ? (
                    <ProfileAvatar
                      avatarUrl={onboardingState.avatarUrl}
                      displayName={displayName}
                      fallbackLabel="U"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground" aria-hidden="true">
                      {displayName.slice(0, 1).toUpperCase() || "?"}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <input
                    ref={avatarInputRef}
                    id="onboarding-avatar"
                    type="file"
                    aria-label="Profile photo upload"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      const error = file ? validateAvatarFile(file) : null;
                      setAvatarFile(error ? null : file);
                      setAvatarError(error);
                      if (error) showWarningToast(error);
                      else setFormError(null);
                      event.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => avatarInputRef.current?.click()}
                    aria-describedby="onboarding-avatar-help"
                  >
                    <Upload className="mr-2 size-4" aria-hidden="true" />
                    {avatarFile ? "Choose another photo" : "Choose a photo"}
                  </Button>
                  <p id="onboarding-avatar-help" className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP, or GIF · up to 2 MB
                    {avatarFile ? ` · ${avatarFile.name}` : ""}
                  </p>
                  {avatarError ? (
                    <p role="alert" className="text-xs text-red-700">
                      {avatarError}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <p className="border-l-2 border-border py-1 pl-3 text-sm text-muted-foreground">
              When you finish, your wallet address and registration time are saved publicly on the{" "}
              <TermHint term="stellar">Stellar network</TermHint>. A small network fee may apply.
            </p>

            {registration.stepLabel ? (
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                {registration.stepLabel}…
              </p>
            ) : null}
            {registration.configurationError ? (
              <p className="border-l-2 border-amber-400 bg-amber-50/60 py-2.5 pr-3 pl-3 text-sm text-amber-900">
                {registration.configurationError}
              </p>
            ) : null}
            {(formError ?? registration.error) ? (
              <p
                role="alert"
                className="border-l-2 border-red-500 bg-red-50/60 py-2.5 pr-3 pl-3 text-sm text-red-700"
              >
                {formError ?? registration.error}
              </p>
            ) : null}

            <DialogFooter className="gap-2 border-t border-border pt-4 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => {
                  setDialogStep("role");
                  setFormError(null);
                  setFieldErrors({});
                }}
              >
                Back to role choice
              </Button>
              <div className="flex flex-wrap justify-end gap-2">
                {registration.hasPendingTransaction ||
                registration.transaction?.status === "success" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy || registration.isLoading || !isDraftReady}
                    onClick={collectRegistrationCheck}
                  >
                    Check my registration
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  disabled={isBusy || registration.isLoading || !isDraftReady}
                  className="hr-v2-button-primary rounded-md"
                >
                  {isPreparingProfile && !registration.isBusy
                    ? "Saving profile"
                    : registration.isBusy
                      ? registration.stepLabel || "Working…"
                      : "Save profile and finish"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function RequiredMark() {
  return (
    <span className="text-red-600" aria-hidden="true">
      *
    </span>
  );
}
