import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";

import { query } from "../_generated/server";
import { participant, verifyToken } from "./auth";
import { author, card } from "./helpers";

async function publicProfile(ctx: Parameters<typeof author>[0], user: Doc<"users">) {
  const profile = await ctx.db
    .query("socialProfiles")
    .withIndex("by_author", (q) => q.eq("authorId", user._id))
    .unique();
  const [avatarStorageUrl, coverStorageUrl, legacyAvatarStorageUrl] = await Promise.all([
    profile?.avatarStorageId ? ctx.storage.getUrl(profile.avatarStorageId) : null,
    profile?.coverStorageId ? ctx.storage.getUrl(profile.coverStorageId) : null,
    !profile?.avatarStorageId && !profile?.avatarUrl && user.avatarStorageId
      ? ctx.storage.getUrl(user.avatarStorageId)
      : null,
  ]);
  return {
    name: profile?.name || user.name?.trim() || "Highrable participant",
    headline: profile?.headline ?? "",
    about: profile?.about ?? user.bio ?? "",
    workplace: profile?.workplace ?? user.companyName ?? "",
    skills: profile?.skills ?? user.skills ?? [],
    links: profile?.links ?? [],
    avatarUrl:
      avatarStorageUrl ?? profile?.avatarUrl ?? legacyAvatarStorageUrl ?? user.avatarUrl ?? null,
    coverUrl: coverStorageUrl ?? profile?.coverUrl ?? null,
    workHistory: profile?.workHistory ?? [],
    certificates: profile?.certificates ?? [],
    portfolio: profile?.portfolio ?? [],
  };
}

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
  args: {
    postId: v.id("socialPosts"),
    token: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.postId);
    const viewer = args.token ? await participant(ctx, args.token).catch(() => null) : null;
    const rows = await ctx.db
      .query("socialComments")
      .withIndex("by_post_parent", (q) =>
        q.eq("postId", args.postId).eq("parentId", undefined).eq("status", "published"),
      )
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 20) });
    return {
      ...rows,
      page:
        parent?.status === "published"
          ? await Promise.all(
              rows.page.map(async (c) => {
                const [commentAuthor, reactions, ownReaction] = await Promise.all([
                  author(ctx, c.authorId),
                  ctx.db
                    .query("socialCommentReactions")
                    .withIndex("by_comment", (q) => q.eq("commentId", c._id))
                    .collect(),
                  viewer
                    ? ctx.db
                        .query("socialCommentReactions")
                        .withIndex("by_comment_author", (q) =>
                          q.eq("commentId", c._id).eq("authorId", viewer._id),
                        )
                        .unique()
                    : null,
                ]);
                return {
                  ...c,
                  author: commentAuthor,
                  reactionCount: reactions.length,
                  viewerReaction:
                    (ownReaction?.kind as
                      | "Like"
                      | "Celebrate"
                      | "Support"
                      | "Love"
                      | "Insightful"
                      | "Funny"
                      | undefined) ?? null,
                  replyCount: (
                    await ctx.db
                      .query("socialComments")
                      .withIndex("by_post_parent", (q) =>
                        q.eq("postId", c.postId).eq("parentId", c._id).eq("status", "published"),
                      )
                      .collect()
                  ).length,
                };
              }),
            )
          : [],
    };
  },
});
export const replies = query({
  args: {
    commentId: v.id("socialComments"),
    token: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.commentId);
    if (!parent || parent.status !== "published")
      return { page: [], isDone: true, continueCursor: "" };
    const post = await ctx.db.get(parent.postId);
    if (!post || post.status !== "published") return { page: [], isDone: true, continueCursor: "" };
    const rows = await ctx.db
      .query("socialComments")
      .withIndex("by_post_parent", (q) =>
        q.eq("postId", parent.postId).eq("parentId", parent._id).eq("status", "published"),
      )
      .order("asc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 20) });
    const viewer = args.token ? await participant(ctx, args.token).catch(() => null) : null;
    return {
      ...rows,
      page: await Promise.all(
        rows.page.map(async (comment) => {
          const [commentAuthor, reactions] = await Promise.all([
            author(ctx, comment.authorId),
            ctx.db
              .query("socialCommentReactions")
              .withIndex("by_comment", (q) => q.eq("commentId", comment._id))
              .collect(),
          ]);
          return {
            ...comment,
            author: commentAuthor,
            reactionCount: reactions.length,
            viewerReaction:
              (reactions.find((reaction) => reaction.authorId === viewer?._id)?.kind as
                | "Like"
                | "Celebrate"
                | "Support"
                | "Love"
                | "Insightful"
                | "Funny"
                | undefined) ?? null,
          };
        }),
      ),
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
    const details = await publicProfile(ctx, user);
    return {
      author: await author(ctx, user._id),
      details,
      bio: details.about,
      skills: details.skills,
    };
  },
});
export const profileById = query({
  args: { profileId: v.id("users") },
  handler: async (ctx, { profileId }) => {
    const user = await ctx.db.get(profileId);
    if (!user) return null;
    const details = await publicProfile(ctx, user);
    return { id: user._id, author: await author(ctx, user._id), details };
  },
});
export const searchPeople = query({
  args: { term: v.string() },
  handler: async (ctx, { term }) => {
    const normalized = term.trim().replace(/\s+/g, " ");
    if (normalized.length < 2) return [];
    const [profiles, users] = await Promise.all([
      ctx.db
        .query("socialProfiles")
        .withSearchIndex("search_name", (q) => q.search("name", normalized))
        .take(10),
      ctx.db
        .query("users")
        .withSearchIndex("search_name", (q) => q.search("name", normalized))
        .take(10),
    ]);
    const profileIds = new Set(profiles.map((profile) => profile.authorId));
    const results = await Promise.all(
      profiles.map(async (profile) => {
        const user = await ctx.db.get(profile.authorId);
        if (!user) return null;
        const publicFields = await publicProfile(ctx, user);
        return {
          id: user._id,
          name: publicFields.name,
          headline: publicFields.headline,
          avatarUrl: publicFields.avatarUrl,
        };
      }),
    );
    for (const user of users) {
      if (profileIds.has(user._id)) continue;
      const publicFields = await publicProfile(ctx, user);
      if (publicFields.name === "Highrable participant") continue;
      results.push({
        id: user._id,
        name: publicFields.name,
        headline: publicFields.headline,
        avatarUrl: publicFields.avatarUrl,
      });
    }
    return results
      .filter((result): result is NonNullable<typeof result> => result !== null)
      .slice(0, 10);
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
