import { v } from "convex/values";

import { query } from "../_generated/server";
import { ForbiddenError } from "../_shared/errors";
import { verifyToken } from "../newsfeed/auth";
import {
  findPrivateEmail,
  findUserByHandle,
  findUserByWallet,
  resolveAvatarUrl,
  sanitizePublicHandle,
  sanitizeUserWalletAddress,
} from "./helpers";
import { roleValidator } from "./schema";

export const getUserByWallet = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const walletAddress = sanitizeUserWalletAddress(args.walletAddress);
    return await findUserByWallet(ctx, walletAddress);
  },
});

export const getOnboardingState = query({
  args: {
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const walletAddress = sanitizeUserWalletAddress(args.walletAddress);
    const user = await findUserByWallet(ctx, walletAddress);

    if (!user) {
      return {
        exists: false,
        isComplete: false,
        user: null,
        avatarUrl: null,
      };
    }

    return {
      exists: true,
      isComplete: Boolean(user.onboardingCompletedAt),
      user,
      avatarUrl: (await resolveAvatarUrl(ctx, user)) ?? null,
    };
  },
});

export const getPrivateEmail = query({
  args: {
    sessionToken: v.string(),
    walletAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.sessionToken.trim()) {
      throw new ForbiddenError("Sign in with your verified Highrable session to view your email.");
    }
    const walletAddress = sanitizeUserWalletAddress(await verifyToken(args.sessionToken));
    if (
      args.walletAddress !== undefined &&
      sanitizeUserWalletAddress(args.walletAddress) !== walletAddress
    ) {
      throw new ForbiddenError("The verified session does not match this wallet.");
    }
    return (await findPrivateEmail(ctx, walletAddress))?.email ?? null;
  },
});

export const isPublicHandleAvailable = query({
  args: {
    publicHandle: v.string(),
    walletAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { normalizedPublicHandle } = sanitizePublicHandle(args.publicHandle);
    const existingUser = await findUserByHandle(ctx, normalizedPublicHandle);

    if (!existingUser) {
      return true;
    }

    if (!args.walletAddress) {
      return false;
    }

    const walletAddress = sanitizeUserWalletAddress(args.walletAddress);
    return existingUser.walletAddress === walletAddress;
  },
});

export const listUsersByRole = query({
  args: {
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .take(100);
  },
});
