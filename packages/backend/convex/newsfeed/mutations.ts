import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { participant, verifyToken } from "./auth";
import { published, requestKey, safeUrl } from "./helpers";
import { reactionKind } from "./schema";

export const beginPost = mutation({
  args: { token: v.string(), requestId: v.string(), originalId: v.optional(v.id("socialPosts")) },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    requestKey(args.requestId);
    const prior = await ctx.db
      .query("socialPosts")
      .withIndex("by_request", (q) => q.eq("authorId", user._id).eq("requestId", args.requestId))
      .unique();
    if (prior) return prior._id;
    const source = args.originalId ? await published(ctx, args.originalId) : null;
    const originalId = source?.originalId ?? source?._id;
    if (originalId) await published(ctx, originalId);
    return ctx.db.insert("socialPosts", {
      authorId: user._id,
      requestId: args.requestId,
      status: "draft",
      ...(originalId ? { originalId } : {}),
      reactionCount: 0,
      commentCount: 0,
      mediaCount: 0,
      pendingMedia: 0,
      updatedAt: Date.now(),
    });
  },
});
export const publish = mutation({
  args: { token: v.string(), postId: v.id("socialPosts"), bodyId: v.optional(v.id("socialMedia")) },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== user._id)
      throw new Error("Only the author can publish this post.");
    if (post.status === "published") return post._id;
    if (post.status !== "draft" || post.pendingMedia !== 0)
      throw new Error("Finish or remove failed uploads before publishing.");
    const body = args.bodyId ? await ctx.db.get(args.bodyId) : null;
    if (
      args.bodyId &&
      (!body ||
        body.postId !== post._id ||
        body.removed ||
        !body.complete ||
        body.mime !== "text/plain")
    )
      throw new Error("Text upload is incomplete.");
    if (!body?.size && !post.mediaCount && !post.originalId)
      throw new Error("Write something or add media.");
    if (post.originalId) await published(ctx, post.originalId);
    await ctx.db.patch(post._id, {
      status: "published",
      publishedAt: Date.now(),
      ...(args.bodyId ? { bodyId: args.bodyId } : {}),
      updatedAt: Date.now(),
    });
    return post._id;
  },
});
export const editPost = mutation({
  args: { token: v.string(), postId: v.id("socialPosts"), bodyId: v.id("socialMedia") },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const post = await published(ctx, args.postId);
    const body = await ctx.db.get(args.bodyId);
    if (
      post.authorId !== user._id ||
      !body ||
      body.authorId !== user._id ||
      body.postId !== post._id ||
      !body.complete ||
      body.removed ||
      body.mime !== "text/plain"
    )
      throw new Error("Cannot edit this post.");
    await ctx.db.patch(post._id, { bodyId: body._id, updatedAt: Date.now() });
  },
});
export const deletePost = mutation({
  args: { token: v.string(), postId: v.id("socialPosts") },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const post = await ctx.db.get(args.postId);
    if (!post || post.authorId !== user._id)
      throw new Error("Only the author can delete this post.");
    await ctx.db.patch(post._id, { status: "deleted", updatedAt: Date.now() });
  },
});
export const react = mutation({
  args: { token: v.string(), postId: v.id("socialPosts"), kind: v.union(reactionKind, v.null()) },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const post = await published(ctx, args.postId);
    const prior = await ctx.db
      .query("socialReactions")
      .withIndex("by_post_author", (q) => q.eq("postId", post._id).eq("authorId", user._id))
      .unique();
    if (args.kind === null) {
      if (prior) {
        await ctx.db.delete(prior._id);
        await ctx.db.patch(post._id, { reactionCount: post.reactionCount - 1 });
      }
    } else if (prior) await ctx.db.patch(prior._id, { kind: args.kind });
    else {
      await ctx.db.insert("socialReactions", {
        postId: post._id,
        authorId: user._id,
        kind: args.kind,
      });
      await ctx.db.patch(post._id, { reactionCount: post.reactionCount + 1 });
    }
  },
});
export const beginStory = mutation({
  args: { token: v.string(), requestId: v.string() },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    requestKey(args.requestId);
    const prior = await ctx.db
      .query("socialStories")
      .withIndex("by_author_request", (q) =>
        q.eq("authorId", user._id).eq("requestId", args.requestId),
      )
      .unique();
    if (prior) return prior._id;
    const now = Date.now();
    return ctx.db.insert("socialStories", {
      authorId: user._id,
      requestId: args.requestId,
      status: "draft",
      mediaCount: 0,
      pendingMedia: 0,
      reactionCount: 0,
      likeCount: 0,
      celebrateCount: 0,
      supportCount: 0,
      loveCount: 0,
      insightfulCount: 0,
      funnyCount: 0,
      updatedAt: now,
      expiresAt: now + 24 * 60 * 60_000,
    });
  },
});
export const publishStory = mutation({
  args: { token: v.string(), storyId: v.id("socialStories") },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const story = await ctx.db.get(args.storyId);
    if (!story || story.authorId !== user._id)
      throw new Error("Only the author can publish this story.");
    if (story.status === "published" && story.expiresAt > Date.now()) return story._id;
    if (story.status !== "draft" || story.pendingMedia !== 0 || story.mediaCount === 0)
      throw new Error("Finish your uploads and add at least one photo or video.");
    const publishedAt = Date.now();
    const expiresAt = publishedAt + 24 * 60 * 60_000;
    await ctx.db.patch(story._id, {
      status: "published",
      publishedAt,
      expiresAt,
      updatedAt: publishedAt,
    });
    const media = await ctx.db
      .query("socialMedia")
      .withIndex("by_story", (q) =>
        q.eq("storyId", story._id).eq("removed", false).eq("complete", true),
      )
      .take(50);
    for (const item of media) await ctx.db.patch(item._id, { expiresAt });
    return story._id;
  },
});
export const deleteStory = mutation({
  args: { token: v.string(), storyId: v.id("socialStories") },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const story = await ctx.db.get(args.storyId);
    if (!story || story.authorId !== user._id)
      throw new Error("Only the author can delete this story.");
    if (story.status === "deleted") return;
    const now = Date.now();
    await ctx.db.patch(story._id, { status: "deleted", expiresAt: now, updatedAt: now });
    const media = await ctx.db
      .query("socialMedia")
      .withIndex("by_story", (q) => q.eq("storyId", story._id))
      .take(50);
    for (const item of media) await ctx.db.patch(item._id, { expiresAt: now });
  },
});
export const reactToStory = mutation({
  args: {
    token: v.string(),
    storyId: v.id("socialStories"),
    kind: v.union(reactionKind, v.null()),
  },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const story = await ctx.db.get(args.storyId);
    if (!story || story.status !== "published" || story.expiresAt <= Date.now())
      throw new Error("Story unavailable.");
    const prior = await ctx.db
      .query("socialStoryReactions")
      .withIndex("by_story_author", (q) => q.eq("storyId", story._id).eq("authorId", user._id))
      .unique();
    if (prior?.kind === args.kind) return;
    const counts = {
      likeCount: story.likeCount,
      celebrateCount: story.celebrateCount,
      supportCount: story.supportCount,
      loveCount: story.loveCount,
      insightfulCount: story.insightfulCount,
      funnyCount: story.funnyCount,
    };
    const adjust = (kind: string, delta: number) => {
      switch (kind) {
        case "Like":
          counts.likeCount += delta;
          break;
        case "Celebrate":
          counts.celebrateCount += delta;
          break;
        case "Support":
          counts.supportCount += delta;
          break;
        case "Love":
          counts.loveCount += delta;
          break;
        case "Insightful":
          counts.insightfulCount += delta;
          break;
        case "Funny":
          counts.funnyCount += delta;
      }
    };
    if (prior) adjust(prior.kind, -1);
    if (args.kind) adjust(args.kind, 1);
    if (args.kind && prior) await ctx.db.patch(prior._id, { kind: args.kind });
    else if (args.kind)
      await ctx.db.insert("socialStoryReactions", {
        storyId: story._id,
        authorId: user._id,
        kind: args.kind,
      });
    else if (prior) await ctx.db.delete(prior._id);
    await ctx.db.patch(story._id, {
      reactionCount:
        story.reactionCount + (prior ? 0 : args.kind ? 1 : 0) - (prior && !args.kind ? 1 : 0),
      ...counts,
    });
  },
});
export const comment = mutation({
  args: { token: v.string(), postId: v.id("socialPosts"), requestId: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    requestKey(args.requestId);
    const post = await published(ctx, args.postId);
    const prior = await ctx.db
      .query("socialComments")
      .withIndex("by_request", (q) => q.eq("authorId", user._id).eq("requestId", args.requestId))
      .unique();
    if (prior) {
      if (prior.postId !== post._id) throw new Error("Request key belongs to another post.");
      return prior._id;
    }
    if (!args.body.trim()) throw new Error("Write a comment.");
    const id = await ctx.db.insert("socialComments", {
      authorId: user._id,
      postId: post._id,
      requestId: args.requestId,
      body: args.body,
      status: "published",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(post._id, { commentCount: post.commentCount + 1 });
    return id;
  },
});
export const editComment = mutation({
  args: {
    token: v.string(),
    commentId: v.id("socialComments"),
    body: v.optional(v.string()),
    deleted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const c = await ctx.db.get(args.commentId);
    if (!c || c.authorId !== user._id) throw new Error("Only the author can edit this comment.");
    if (c.status === "deleted" && args.deleted) return;
    if (c.status !== "published") throw new Error("Comment unavailable.");
    const post = await published(ctx, c.postId);
    if (!args.deleted && !args.body?.trim()) throw new Error("Write a comment.");
    await ctx.db.patch(c._id, {
      status: args.deleted ? "deleted" : "published",
      ...(args.body !== undefined ? { body: args.body } : {}),
      updatedAt: Date.now(),
    });
    if (args.deleted) await ctx.db.patch(post._id, { commentCount: post.commentCount - 1 });
  },
});
export const report = mutation({
  args: {
    token: v.string(),
    postId: v.optional(v.id("socialPosts")),
    commentId: v.optional(v.id("socialComments")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    if (!!args.postId === !!args.commentId || !args.reason.trim())
      throw new Error("Choose one report target and describe the issue.");
    const prior = args.postId
      ? await ctx.db
          .query("socialReports")
          .withIndex("by_author_post", (q) => q.eq("authorId", user._id).eq("postId", args.postId))
          .unique()
      : await ctx.db
          .query("socialReports")
          .withIndex("by_author_comment", (q) =>
            q.eq("authorId", user._id).eq("commentId", args.commentId),
          )
          .unique();
    if (prior) return prior._id;
    if (args.postId) await published(ctx, args.postId);
    if (args.commentId) {
      const comment = await ctx.db.get(args.commentId);
      if (comment?.status !== "published") throw new Error("Comment unavailable.");
      await published(ctx, comment.postId);
    }
    return ctx.db.insert("socialReports", {
      authorId: user._id,
      ...(args.postId ? { postId: args.postId } : { commentId: args.commentId! }),
      reason: args.reason,
    });
  },
});
export const moderate = mutation({
  args: {
    token: v.string(),
    postId: v.optional(v.id("socialPosts")),
    commentId: v.optional(v.id("socialComments")),
    hidden: v.boolean(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const wallet = await verifyToken(args.token);
    if (
      !process.env.HIGHRABLE_ADMIN_WALLET_ADDRESS ||
      wallet !== process.env.HIGHRABLE_ADMIN_WALLET_ADDRESS ||
      !!args.postId === !!args.commentId ||
      !args.reason.trim()
    )
      throw new Error("Administrator authorization required.");
    const id = args.postId ?? args.commentId!;
    const target = await ctx.db.get(id);
    if (!target || (target.status !== "published" && target.status !== "hidden"))
      throw new Error("Content unavailable.");
    const status = args.hidden ? "hidden" : "published";
    if (target.status === status) return;
    if (args.commentId && "postId" in target) {
      const post = await ctx.db.get(target.postId);
      if (post)
        await ctx.db.patch(post._id, { commentCount: post.commentCount + (args.hidden ? -1 : 1) });
    }
    await ctx.db.patch(id, { status, updatedAt: Date.now() });
    await ctx.db.insert("socialModeration", {
      moderator: wallet,
      target: id,
      hidden: args.hidden,
      reason: args.reason,
    });
  },
});
export const saveProfile = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    headline: v.string(),
    about: v.string(),
    skills: v.array(v.string()),
    links: v.array(v.string()),
    coverUrl: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const wallet = await verifyToken(args.token);
    const user = await ctx.db
      .query("users")
      .withIndex("by_walletAddress", (q) => q.eq("walletAddress", wallet))
      .unique();
    if (!user || !args.name.trim())
      throw new Error("Sign in and enter a name to save your profile.");
    const { token: _token, ...fields } = args;
    const record = {
      ...fields,
      name: args.name.trim(),
      links: args.links.map(safeUrl),
      ...(args.coverUrl ? { coverUrl: safeUrl(args.coverUrl) } : {}),
      ...(args.avatarUrl ? { avatarUrl: safeUrl(args.avatarUrl) } : {}),
      authorId: user._id,
    };
    const prior = await ctx.db
      .query("socialProfiles")
      .withIndex("by_author", (q) => q.eq("authorId", user._id))
      .unique();
    if (prior) await ctx.db.replace(prior._id, record);
    else await ctx.db.insert("socialProfiles", record);
  },
});
