import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { isConfiguredAdminWallet } from "../_shared/adminAuth";
import { BadRequestError, ForbiddenError } from "../_shared/errors";
import { verifyToken } from "../newsfeed/auth";
import { findRegistryRegistration, getConfiguredRegistryScope } from "../registry/helpers";
import {
  assertPublicHandleAvailable,
  ensureUserIdentity,
  findPrivateEmail,
  findUserByWallet,
  sanitizeOnboardingProfile,
  sanitizeUserName,
  sanitizeUserWalletAddress,
} from "./helpers";
import { initialRoleValidator, roleValidator, walletTypeValidator, type TUserRole } from "./schema";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizePrivateEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new BadRequestError("Please enter a valid email address.");
  }
  return email;
}

async function getSessionWallet(sessionToken: string, claimedWalletAddress?: string) {
  if (!sessionToken.trim()) {
    throw new ForbiddenError("Sign in with your verified Highrable session to manage your email.");
  }
  const walletAddress = sanitizeUserWalletAddress(await verifyToken(sessionToken));
  if (
    claimedWalletAddress !== undefined &&
    sanitizeUserWalletAddress(claimedWalletAddress) !== walletAddress
  ) {
    throw new ForbiddenError("The verified session does not match this wallet.");
  }
  return walletAddress;
}

export const upsertUser = mutation({
  args: {
    walletAddress: v.string(),
    role: v.optional(roleValidator),
    name: v.optional(v.string()),
    walletType: v.optional(walletTypeValidator),
  },
  handler: async (ctx, args) => {
    const walletAddress = sanitizeUserWalletAddress(args.walletAddress);
    const name = sanitizeUserName(args.name);
    const existingUser = await findUserByWallet(ctx, walletAddress);
    const role = isConfiguredAdminWallet(walletAddress) ? "admin" : existingUser?.role;

    if (existingUser) {
      const patch: {
        role?: (typeof args)["role"];
        name?: string;
        walletType?: (typeof args)["walletType"];
        updatedAt: number;
      } = {
        ...(role !== undefined ? { role } : {}),
        updatedAt: Date.now(),
      };
      if (name !== undefined) {
        patch.name = name;
      }
      if (args.walletType !== undefined) {
        patch.walletType = args.walletType;
      }

      await ctx.db.patch(existingUser._id, patch);
      return existingUser._id;
    }

    return await ctx.db.insert("users", {
      walletAddress,
      ...(role !== undefined ? { role } : {}),
      createdAt: Date.now(),
      ...(name !== undefined ? { name } : {}),
      ...(args.walletType !== undefined ? { walletType: args.walletType } : {}),
    });
  },
});

export const recordWalletIdentity = mutation({
  args: {
    walletAddress: v.string(),
    walletType: walletTypeValidator,
  },
  handler: async (ctx, args) => {
    return await ensureUserIdentity(ctx, args.walletAddress, args.walletType);
  },
});

export const saveProfileDraft = mutation({
  args: {
    walletAddress: v.string(),
    walletType: v.optional(walletTypeValidator),
    role: v.optional(initialRoleValidator),
    firstName: v.string(),
    middleName: v.optional(v.string()),
    lastName: v.string(),
    publicHandle: v.string(),
    coreSkills: v.array(v.string()),
    discordHandle: v.optional(v.string()),
    xHandle: v.optional(v.string()),
    githubUsername: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const walletAddress = sanitizeUserWalletAddress(args.walletAddress);
    const existingUser = await findUserByWallet(ctx, walletAddress);
    const profile = await sanitizeOnboardingProfile(ctx, args, { requireSkills: false });
    await assertPublicHandleAvailable(ctx, profile.normalizedPublicHandle, existingUser?._id);

    const now = Date.now();
    const role: TUserRole | undefined =
      isConfiguredAdminWallet(walletAddress) || existingUser?.role === "admin"
        ? "admin"
        : (args.role ?? existingUser?.role);
    const patch = {
      walletAddress,
      ...(role !== undefined ? { role } : {}),
      ...(args.walletType !== undefined ? { walletType: args.walletType } : {}),
      ...profile,
      skills: profile.coreSkills,
      updatedAt: now,
    };

    if (existingUser) {
      await ctx.db.patch(existingUser._id, patch);
      return existingUser._id;
    }

    return await ctx.db.insert("users", {
      ...patch,
      createdAt: now,
    });
  },
});

export const completeOnboarding = mutation({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const walletAddress = sanitizeUserWalletAddress(args.walletAddress);
    const existingUser = await findUserByWallet(ctx, walletAddress);

    if (existingUser?.onboardingCompletedAt) {
      return existingUser._id;
    }

    if (!existingUser) {
      throw new Error("Save a valid profile before completing onboarding.");
    }

    const privateEmail = await findPrivateEmail(ctx, walletAddress);
    if (!privateEmail) {
      throw new BadRequestError("Add a valid email address before completing onboarding.");
    }
    sanitizePrivateEmail(privateEmail.email);

    const registryScope = getConfiguredRegistryScope();
    const registration = await findRegistryRegistration(ctx, {
      ...registryScope,
      walletAddress,
    });
    if (!registration) {
      throw new Error("Verify your on-chain wallet registration before completing onboarding.");
    }

    const profile = await sanitizeOnboardingProfile(
      ctx,
      {
        firstName: existingUser.firstName ?? "",
        ...(existingUser.middleName ? { middleName: existingUser.middleName } : {}),
        lastName: existingUser.lastName ?? "",
        publicHandle: existingUser.publicHandle ?? "",
        coreSkills: existingUser.coreSkills ?? [],
        ...(existingUser.discordHandle ? { discordHandle: existingUser.discordHandle } : {}),
        ...(existingUser.xHandle ? { xHandle: existingUser.xHandle } : {}),
        ...(existingUser.githubUsername ? { githubUsername: existingUser.githubUsername } : {}),
        ...(existingUser.avatarStorageId ? { avatarStorageId: existingUser.avatarStorageId } : {}),
      },
      { requireSkills: false },
    );
    await assertPublicHandleAvailable(ctx, profile.normalizedPublicHandle, existingUser._id);

    const now = Date.now();
    const role = isConfiguredAdminWallet(walletAddress) ? "admin" : existingUser.role;
    await ctx.db.patch(existingUser._id, {
      ...(role !== undefined ? { role } : {}),
      ...profile,
      skills: profile.coreSkills,
      onboardingCompletedAt: now,
      updatedAt: now,
    });
    return existingUser._id;
  },
});

export const savePrivateEmail = mutation({
  args: {
    sessionToken: v.string(),
    walletAddress: v.optional(v.string()),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const walletAddress = await getSessionWallet(args.sessionToken, args.walletAddress);
    const email = sanitizePrivateEmail(args.email);
    const existing = await findPrivateEmail(ctx, walletAddress);
    const updatedAt = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { email, updatedAt });
      return existing._id;
    }

    return await ctx.db.insert("privateEmails", { walletAddress, email, updatedAt });
  },
});
