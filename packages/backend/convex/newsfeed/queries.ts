import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";

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
      const user = await participant(ctx, token);
      const profile = await author(ctx, user._id);
      return { ...user, avatarUrl: profile.avatarUrl ?? undefined };
    } catch {
      return null;
    }
  },
});
export const feed = query({
  args: {
    authorId: v.optional(v.id("users")),
    token: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = args.token ? await participant(ctx, args.token).catch(() => null) : null;
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
    return { ...rows, page: await Promise.all(rows.page.map((p) => card(ctx, p, viewer?._id))) };
  },
});
export const post = query({
  args: { id: v.id("socialPosts"), token: v.optional(v.string()) },
  handler: async (ctx, { id, token }) => {
    const p = await ctx.db.get(id);
    if (p?.status !== "published") return null;
    const viewer = token ? await participant(ctx, token).catch(() => null) : null;
    return card(ctx, p, viewer?._id);
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
export const media = query({
  args: { postId: v.id("socialPosts"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.postId);
    const result = await ctx.db
      .query("socialMedia")
      .withIndex("by_post", (q) =>
        q.eq("postId", args.postId).eq("removed", false).eq("complete", true),
      )
      .filter((q) => q.neq(q.field("mime"), "text/plain"))
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 12) });
    return {
      ...result,
      page:
        parent?.status === "published"
          ? result.page.map(({ _id, name, mime, size }) => ({ _id, name, mime, size }))
          : [],
    };
  },
});
export const activeStories = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    const viewer = token ? await participant(ctx, token).catch(() => null) : null;
    const rows = await ctx.db
      .query("socialStories")
      .withIndex("by_expiry", (q) => q.gt("expiresAt", Date.now()))
      .order("desc")
      .take(100);
    const active = rows.filter((story) => story.status === "published");
    type ActiveStory = {
      _id: Id<"socialStories">;
      publishedAt?: number;
      expiresAt: number;
      mediaCount: number;
      reactionCount: number;
      reactionCounts: Record<
        "Like" | "Celebrate" | "Support" | "Love" | "Insightful" | "Funny",
        number
      >;
      viewerReaction: string | null;
      media: Array<{ _id: Id<"socialMedia">; name: string; mime: string; size: number }>;
    };
    const groups = new Map<
      string,
      { author: Awaited<ReturnType<typeof author>>; stories: ActiveStory[] }
    >();
    for (const story of active) {
      const [storyAuthor, media, reaction] = await Promise.all([
        author(ctx, story.authorId),
        ctx.db
          .query("socialMedia")
          .withIndex("by_story", (q) =>
            q.eq("storyId", story._id).eq("removed", false).eq("complete", true),
          )
          .order("asc")
          .take(1),
        viewer
          ? ctx.db
              .query("socialStoryReactions")
              .withIndex("by_story_author", (q) =>
                q.eq("storyId", story._id).eq("authorId", viewer._id),
              )
              .unique()
          : null,
      ]);
      const group = groups.get(story.authorId);
      const item: ActiveStory = {
        _id: story._id,
        publishedAt: story.publishedAt,
        expiresAt: story.expiresAt,
        mediaCount: story.mediaCount,
        reactionCount: story.reactionCount,
        reactionCounts: {
          Like: story.likeCount,
          Celebrate: story.celebrateCount,
          Support: story.supportCount,
          Love: story.loveCount,
          Insightful: story.insightfulCount,
          Funny: story.funnyCount,
        },
        viewerReaction: reaction?.kind ?? null,
        media: media.map(({ _id, name, mime, size }) => ({ _id, name, mime, size })),
      };
      if (group) group.stories.push(item);
      else groups.set(story.authorId, { author: storyAuthor, stories: [item] });
    }
    return Array.from(groups.values());
  },
});
export const storyPreview = query({
  args: { mediaId: v.id("socialMedia") },
  handler: async (ctx, { mediaId }) => {
    const media = await ctx.db.get(mediaId);
    const story = media?.storyId ? await ctx.db.get(media.storyId) : null;
    if (!media || media.removed || !media.complete || !story) return null;
    if (story.status !== "published" || story.expiresAt <= Date.now()) return null;
    return media.preview ?? null;
  },
});
export const storyMedia = query({
  args: { storyId: v.id("socialStories"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const story = await ctx.db.get(args.storyId);
    if (!story || story.status !== "published" || story.expiresAt <= Date.now())
      return { page: [], isDone: true, continueCursor: "" };
    const rows = await ctx.db
      .query("socialMedia")
      .withIndex("by_story", (q) =>
        q.eq("storyId", args.storyId).eq("removed", false).eq("complete", true),
      )
      .order("asc")
      .filter((q) => q.neq(q.field("mime"), "text/plain"))
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 20) });
    return {
      ...rows,
      page: rows.page.map(({ _id, name, mime, size }) => ({ _id, name, mime, size })),
    };
  },
});
export const chunks = query({
  args: { mediaId: v.id("socialMedia"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.mediaId);
    const p = m?.postId ? await ctx.db.get(m.postId) : null;
    const story = m?.storyId ? await ctx.db.get(m.storyId) : null;
    if (
      !m ||
      m.removed ||
      !m.complete ||
      (!p && !story) ||
      (p && p.status !== "published") ||
      (story && (story.status !== "published" || story.expiresAt <= Date.now())) ||
      (m.mime === "text/plain" && (!p || p.bodyId !== m._id))
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
