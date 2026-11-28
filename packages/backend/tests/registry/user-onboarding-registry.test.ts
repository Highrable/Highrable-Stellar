import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { beforeEach, describe, expect, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

import schema from "../../convex/schema";
import { modules } from "../convexModules";

type TProfileDraftArgs = {
  walletAddress: string;
  role?: "client" | "freelancer";
  firstName: string;
  lastName: string;
  publicHandle: string;
  coreSkills: string[];
};

type TCompleteOnboardingArgs = { walletAddress: string };

type TApplyVerifiedRegistrationArgs = {
  network: string;
  registryContractId: string;
  walletAddress: string;
  registeredAt: number;
  verifiedAt: number;
};

const CONTRACT_ID = `C${"A".repeat(55)}`;
const FIRST_WALLET = `G${"B".repeat(55)}`;
const SECOND_WALLET = `G${"C".repeat(55)}`;
const saveProfileDraftRef = makeFunctionReference<"mutation", TProfileDraftArgs, Id<"users">>(
  "users/mutations:saveProfileDraft",
);
const completeOnboardingRef = makeFunctionReference<
  "mutation",
  TCompleteOnboardingArgs,
  Id<"users">
>("users/mutations:completeOnboarding");
const applyVerifiedRegistrationRef = makeFunctionReference<
  "mutation",
  TApplyVerifiedRegistrationArgs,
  Id<"registryRegistrations">
>("registry/mutations:applyVerifiedRegistration");

function profileDraft(walletAddress: string, publicHandle: string): TProfileDraftArgs {
  return {
    walletAddress,
    firstName: "  Ada  ",
    lastName: "Lovelace",
    publicHandle,
    coreSkills: ["Smart contracts", " smart   contracts ", "TypeScript"],
  };
}

describe("registry gated onboarding", () => {
  beforeEach(() => {
    process.env.STELLAR_NETWORK = "testnet";
    process.env.REGISTRY_CONTRACT_ID = CONTRACT_ID;
    delete process.env.HIGHRABLE_ADMIN_WALLET_ADDRESS;
  });

  it("saves a sanitized profile draft without completing onboarding", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.mutation(saveProfileDraftRef, profileDraft(FIRST_WALLET, "AdaDev"));
    const user = await t.run((ctx) => ctx.db.get(userId));

    expect(user).toMatchObject({
      walletAddress: FIRST_WALLET,
      firstName: "Ada",
      lastName: "Lovelace",
      publicHandle: "adadev",
      normalizedPublicHandle: "adadev",
      skills: ["smart contracts", "TypeScript"],
      coreSkills: ["smart contracts", "TypeScript"],
    });
    expect(user?.onboardingCompletedAt).toBeUndefined();
  });

  it("allows signup drafts with no skills and preserves the selected initial role", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(saveProfileDraftRef, {
      walletAddress: FIRST_WALLET,
      role: "client",
      firstName: "Ada",
      lastName: "Lovelace",
      publicHandle: "ada-client",
      coreSkills: [],
    });
    const user = await t.run((ctx) => ctx.db.get(userId));

    expect(user).toMatchObject({
      role: "client",
      coreSkills: [],
      skills: [],
    });

    await t.mutation(saveProfileDraftRef, {
      walletAddress: FIRST_WALLET,
      role: "freelancer",
      firstName: "Ada",
      lastName: "Lovelace",
      publicHandle: "ada-client",
      coreSkills: [],
    });
    await expect(t.run((ctx) => ctx.db.get(userId))).resolves.toMatchObject({
      role: "freelancer",
    });

    await expect(
      t.mutation(saveProfileDraftRef, {
        walletAddress: SECOND_WALLET,
        role: "admin",
        firstName: "Grace",
        lastName: "Hopper",
        publicHandle: "grace-admin",
        coreSkills: [],
      } as unknown as TProfileDraftArgs),
    ).rejects.toThrow();
  });

  it("keeps the configured admin role regardless of the initial mode choice", async () => {
    const t = convexTest(schema, modules);
    process.env.HIGHRABLE_ADMIN_WALLET_ADDRESS = FIRST_WALLET;
    const userId = await t.mutation(saveProfileDraftRef, {
      walletAddress: FIRST_WALLET,
      role: "client",
      firstName: "Ada",
      lastName: "Lovelace",
      publicHandle: "configured-admin",
      coreSkills: [],
    });

    await expect(t.run((ctx) => ctx.db.get(userId))).resolves.toMatchObject({ role: "admin" });
  });

  it("requires a private email for a new completion", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(saveProfileDraftRef, {
      walletAddress: FIRST_WALLET,
      firstName: "Ada",
      lastName: "Lovelace",
      publicHandle: "ada-no-email",
      coreSkills: [],
    });
    await t.mutation(applyVerifiedRegistrationRef, {
      network: "testnet",
      registryContractId: CONTRACT_ID,
      walletAddress: FIRST_WALLET,
      registeredAt: 1_700_000_000,
      verifiedAt: 1_700_000_100,
    });

    await expect(
      t.mutation(completeOnboardingRef, { walletAddress: FIRST_WALLET }),
    ).rejects.toThrow("Add a valid email address");
  });

  it("rejects invalid drafts and duplicate public handles", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(saveProfileDraftRef, {
        ...profileDraft(FIRST_WALLET, "bad username"),
      }),
    ).rejects.toThrow("Public handle may only include");

    await t.mutation(saveProfileDraftRef, profileDraft(FIRST_WALLET, "same-handle"));
    await expect(
      t.mutation(saveProfileDraftRef, profileDraft(SECOND_WALLET, "SAME-HANDLE")),
    ).rejects.toThrow("Public handle is already taken");
  });

  it("requires a verified registration before completing a new profile", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(saveProfileDraftRef, profileDraft(FIRST_WALLET, "new-user"));
    await t.run((ctx) =>
      ctx.db.insert("privateEmails", {
        walletAddress: FIRST_WALLET,
        email: "ada@example.com",
        updatedAt: Date.now(),
      }),
    );

    await expect(
      t.mutation(completeOnboardingRef, { walletAddress: FIRST_WALLET }),
    ).rejects.toThrow("Verify your on-chain wallet registration");
    const user = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_walletAddress", (q) => q.eq("walletAddress", FIRST_WALLET))
        .unique(),
    );
    expect(user?.onboardingCompletedAt).toBeUndefined();

    await t.mutation(applyVerifiedRegistrationRef, {
      network: "testnet",
      registryContractId: CONTRACT_ID,
      walletAddress: FIRST_WALLET,
      registeredAt: 1_700_000_000,
      verifiedAt: 1_700_000_100,
    });
    const userId = await t.mutation(completeOnboardingRef, { walletAddress: FIRST_WALLET });
    const completedUser = await t.run((ctx) => ctx.db.get(userId));
    expect(completedUser?.onboardingCompletedAt).toBeTypeOf("number");
  });

  it("preserves existing onboarding completion when registry configuration is absent", async () => {
    const t = convexTest(schema, modules);
    const completedAt = 1_700_000_000;
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", {
        walletAddress: FIRST_WALLET,
        firstName: "Ada",
        lastName: "Lovelace",
        publicHandle: "legacy-user",
        normalizedPublicHandle: "legacy-user",
        coreSkills: ["Stellar"],
        skills: ["Stellar"],
        onboardingCompletedAt: completedAt,
        createdAt: completedAt,
      }),
    );
    delete process.env.STELLAR_NETWORK;
    delete process.env.REGISTRY_CONTRACT_ID;

    await expect(t.mutation(completeOnboardingRef, { walletAddress: FIRST_WALLET })).resolves.toBe(
      userId,
    );
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.onboardingCompletedAt).toBe(completedAt);
  });
});
