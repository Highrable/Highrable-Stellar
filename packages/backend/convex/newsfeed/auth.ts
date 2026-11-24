import { v } from "convex/values";

import type { QueryCtx } from "../_generated/server";

import { mutation } from "../_generated/server";

export function secret() {
  const key = process.env.NEWSFEED_SESSION_SECRET;
  if (!key || key.length < 32) throw new Error("Newsfeed authentication is not configured.");
  return key;
}
function decode(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}
export async function verifyToken(token: string, expectedOrigin?: string) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new Error("Sign in to contribute.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify("HMAC", key, decode(signature), new TextEncoder().encode(payload)))
  )
    throw new Error("Invalid social session.");
  const data = JSON.parse(new TextDecoder().decode(decode(payload)));
  if (
    data.aud !== "highrable-social" ||
    typeof data.sub !== "string" ||
    !/^[GC][A-Z2-7]{55}$/.test(data.sub) ||
    !Number.isFinite(data.exp) ||
    data.exp <= Date.now() ||
    data.exp > Date.now() + 16 * 60_000
  )
    throw new Error("Social session expired. Sign in again.");
  if (expectedOrigin !== undefined && data.origin !== expectedOrigin)
    throw new Error("Sign in again from this Highrable website before uploading.");
  return data.sub as string;
}
export async function participant(ctx: QueryCtx, token: string) {
  const wallet = await verifyToken(token);
  const user = await ctx.db
    .query("users")
    .withIndex("by_walletAddress", (q) => q.eq("walletAddress", wallet))
    .unique();
  if (!user) throw new Error("Please sign in again to Highrable Newsfeed.");
  return user;
}
export const consumeNonce = mutation({
  args: { serverSecret: v.string(), nonce: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    if (
      args.serverSecret !== secret() ||
      args.expiresAt <= Date.now() ||
      args.expiresAt > Date.now() + 5 * 60_000
    )
      throw new Error("Invalid challenge.");
    if (
      await ctx.db
        .query("socialNonces")
        .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
        .unique()
    )
      throw new Error("Challenge already used.");
    await ctx.db.insert("socialNonces", { nonce: args.nonce, expiresAt: args.expiresAt });
  },
});

export const ensureParticipant = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const walletAddress = await verifyToken(token);
    const user = await ctx.db
      .query("users")
      .withIndex("by_walletAddress", (q) => q.eq("walletAddress", walletAddress))
      .unique();
    if (user) return user._id;
    return ctx.db.insert("users", {
      walletAddress,
      createdAt: Date.now(),
      walletType: walletAddress.startsWith("C") ? "passkey_smart_account" : "external_wallet",
    });
  },
});
