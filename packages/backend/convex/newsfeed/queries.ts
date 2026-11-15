import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { query } from "../_generated/server";
import { participant, verifyToken } from "./auth";
import { author, card } from "./helpers";

export const configuration = query({
  args: {},
  handler: () => ({ enabled: process.env.NEWSFEED_ENABLED === "true" }),
});
export const viewer = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    try {
      return await participant(ctx, token);
    } catch {
      return null;
    }
  },
});
export const feed = query({
  args: { authorId: v.optional(v.id("users")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const rows = await (
      args.authorId
        ? ctx.db
            .query("socialPosts")
            .withIndex("by_author", (q) =>
              q.eq("authorId", args.authorId!).eq("status", "published"),
            )
        : ctx.db.query("socialPosts").withIndex("by_status", (q) => q.eq("status", "published"))
    )
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 20) });
    return { ...rows, page: await Promise.all(rows.page.map((p) => card(ctx, p))) };
  },
});
export const post = query({
  args: { id: v.id("socialPosts") },
  handler: async (ctx, { id }) => {
    const p = await ctx.db.get(id);
    return p?.status === "published" ? card(ctx, p) : null;
  },
});
export const comments = query({
  args: { postId: v.id("socialPosts"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.postId);
    const rows = await ctx.db
      .query("socialComments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId).eq("status", "published"))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 20) });
    return {
      ...rows,
      page:
        parent?.status === "published"
          ? await Promise.all(
              rows.page.map(async (c) => ({ ...c, author: await author(ctx, c.authorId) })),
            )
          : [],
    };
  },
});
export const reaction = query({
  args: { postId: v.id("socialPosts"), token: v.string() },
  handler: async (ctx, args) => {
    try {
      const user = await participant(ctx, args.token);
      return await ctx.db
        .query("socialReactions")
        .withIndex("by_post_author", (q) => q.eq("postId", args.postId).eq("authorId", user._id))
        .unique();
    } catch {
      return null;
    }
  },
});
export const media = query({
  args: { postId: v.id("socialPosts"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.postId);
    const result = await ctx.db
      .query("socialMedia")
      .withIndex("by_post", (q) =>
        q.eq("postId", args.postId).eq("removed", false).eq("complete", true),
      )
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 12) });
    return {
      ...result,
      page:
        parent?.status === "published" ? result.page.filter((m) => m.mime !== "text/plain") : [],
    };
  },
});
export const chunks = query({
  args: { mediaId: v.id("socialMedia"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.mediaId);
    const p = m ? await ctx.db.get(m.postId) : null;
    if (
      !m ||
      m.removed ||
      !m.complete ||
      p?.status !== "published" ||
      (m.mime === "text/plain" && p.bodyId !== m._id)
    )
      throw new Error("Media unavailable.");
    const result = await ctx.db
      .query("socialChunks")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .order("asc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 20) });
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (c) => ({
          index: c.index,
          url: await ctx.storage.getUrl(c.storageId),
        })),
      ),
    };
  },
});
export const profile = query({
  args: { walletAddress: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_walletAddress", (q) => q.eq("walletAddress", args.walletAddress))
      .unique();
    if (!user) return null;
    const details = await ctx.db
      .query("socialProfiles")
      .withIndex("by_author", (q) => q.eq("authorId", user._id))
      .unique();
    return {
      author: await author(ctx, user._id),
      details,
      companyName: user.companyName ?? null,
      bio: user.bio ?? "",
      skills: user.skills ?? [],
    };
  },
});
export const uploadByRequest = query({
  args: { token: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    return ctx.db
      .query("socialMedia")
      .withIndex("by_request", (q) => q.eq("authorId", user._id).eq("requestId", args.requestId))
      .unique();
  },
});
export const moderationQueue = query({
  args: { token: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const wallet = await verifyToken(args.token);
    if (
      !process.env.HIGHRABLE_ADMIN_WALLET_ADDRESS ||
      wallet !== process.env.HIGHRABLE_ADMIN_WALLET_ADDRESS
    )
      throw new Error("Administrator authorization required.");
    const result = await ctx.db
      .query("socialReports")
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 20) });
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (report) => ({
          ...report,
          target: await ctx.db.get(report.postId ?? report.commentId!),
          reporter: await author(ctx, report.authorId),
        })),
      ),
    };
  },
});
