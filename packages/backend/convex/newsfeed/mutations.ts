import { v } from "convex/values";

import { mutation } from "../_generated/server";
import { participant, verifyToken } from "./auth";
import { normalizeTags, published, requestKey, safeUrl } from "./helpers";
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
      searchText: "",
      searchTags: "",
      updatedAt: Date.now(),
    });
  },
});
export const publish = mutation({
  args: {
    token: v.string(),
    postId: v.id("socialPosts"),
    bodyId: v.optional(v.id("socialMedia")),
    tags: v.optional(v.array(v.string())),
    milestoneId: v.optional(v.id("milestones")),
    milestoneConfirmed: v.optional(v.boolean()),
  },
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
    if (args.milestoneId && args.milestoneConfirmed !== true)
      throw new Error("Confirm sharing the milestone title and status before publishing.");
    if (!args.milestoneId && args.milestoneConfirmed)
      throw new Error("Choose a milestone before confirming it.");
    let milestoneId: typeof args.milestoneId;
    if (args.milestoneId) {
      const milestone = await ctx.db.get(args.milestoneId);
      const job = milestone ? await ctx.db.get(milestone.jobId) : null;
      if (!milestone || !job) throw new Error("Milestone unavailable.");
      const wallet = user.walletAddress;
      if (
        job.clientWallet !== wallet &&
        milestone.assignedFreelancerWallet !== wallet &&
        job.selectedFreelancerWallet !== wallet
      )
        throw new Error("Only a job or milestone participant can attach it.");
      milestoneId = milestone._id;
    }
    const tags = normalizeTags(args.tags ?? []);
    const searchText = [body?.preview ?? "", ...tags].join(" ").slice(0, 1200);
    await ctx.db.patch(post._id, {
      status: "published",
      publishedAt: Date.now(),
      ...(args.bodyId ? { bodyId: args.bodyId } : {}),
      ...(milestoneId ? { milestoneId } : {}),
      tags,
      searchText,
      searchTags: tags.join(" "),
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
    const tags = post.tags ?? [];
    await ctx.db.patch(post._id, {
      bodyId: body._id,
      searchText: [body.preview, ...tags].join(" ").slice(0, 1200),
      searchTags: tags.join(" "),
      updatedAt: Date.now(),
    });
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
  args: {
    token: v.string(),
    requestId: v.string(),
    note: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    requestKey(args.requestId);
    const prior = await ctx.db
      .query("socialStories")
      .withIndex("by_author_request", (q) =>
        q.eq("authorId", user._id).eq("requestId", args.requestId),
      )
      .unique();
    const note = args.note?.trim() ?? "";
    if (note.length > 500) throw new Error("Spark notes must be 500 characters or fewer.");
    const tags = normalizeTags(args.tags ?? []);
    if (prior) {
      if (prior.status === "draft")
        await ctx.db.patch(prior._id, {
          note: note || undefined,
          tags,
          searchText: [note, ...tags].join(" ").slice(0, 600),
          searchTags: tags.join(" "),
          updatedAt: Date.now(),
        });
      return prior._id;
    }
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
      ...(note ? { note } : {}),
      tags,
      searchText: [note, ...tags].join(" ").slice(0, 600),
      searchTags: tags.join(" "),
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
  args: {
    token: v.string(),
    postId: v.id("socialPosts"),
    parentId: v.optional(v.id("socialComments")),
    requestId: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    requestKey(args.requestId);
    const post = await published(ctx, args.postId);
    if (args.body.length > 3_000) throw new Error("Comments must be 3,000 characters or fewer.");
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.postId !== post._id || parent.status !== "published" || parent.parentId)
        throw new Error("Replies must belong to an active top-level comment.");
    }
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
      ...(args.parentId ? { parentId: args.parentId } : {}),
      requestId: args.requestId,
      body: args.body,
      status: "published",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(post._id, { commentCount: post.commentCount + 1 });
    return id;
  },
});
export const reactToComment = mutation({
  args: {
    token: v.string(),
    commentId: v.id("socialComments"),
    kind: v.union(reactionKind, v.null()),
  },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.status !== "published") throw new Error("Comment unavailable.");
    await published(ctx, comment.postId);
    const prior = await ctx.db
      .query("socialCommentReactions")
      .withIndex("by_comment_author", (q) =>
        q.eq("commentId", comment._id).eq("authorId", user._id),
      )
      .unique();
    if (prior?.kind === args.kind) return;
    if (prior && args.kind) await ctx.db.patch(prior._id, { kind: args.kind });
    else if (prior) await ctx.db.delete(prior._id);
    else if (args.kind)
      await ctx.db.insert("socialCommentReactions", {
        commentId: comment._id,
        authorId: user._id,
        kind: args.kind,
      });
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
    if (args.body && args.body.length > 3_000)
      throw new Error("Comments must be 3,000 characters or fewer.");
    await ctx.db.patch(c._id, {
      status: args.deleted ? "deleted" : "published",
      ...(args.body !== undefined ? { body: args.body } : {}),
      updatedAt: Date.now(),
    });
    if (args.deleted) {
      const replies = c.parentId
        ? []
        : await ctx.db
            .query("socialComments")
            .withIndex("by_post_parent", (q) => q.eq("postId", post._id).eq("parentId", c._id))
            .collect();
      for (const reply of replies) {
        await ctx.db.patch(reply._id, {
          status: "deleted",
          hiddenByParent: undefined,
          updatedAt: Date.now(),
        });
        const replyReactions = await ctx.db
          .query("socialCommentReactions")
          .withIndex("by_comment", (q) => q.eq("commentId", reply._id))
          .collect();
        for (const reaction of replyReactions) await ctx.db.delete(reaction._id);
      }
      const reactions = await ctx.db
        .query("socialCommentReactions")
        .withIndex("by_comment", (q) => q.eq("commentId", c._id))
        .collect();
      for (const reaction of reactions) await ctx.db.delete(reaction._id);
      await ctx.db.patch(post._id, {
        commentCount: Math.max(
          0,
          post.commentCount - 1 - replies.filter((reply) => reply.status === "published").length,
        ),
      });
    }
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
      let affectedReplies = 0;
      if (post && !target.parentId) {
        const replies = await ctx.db
          .query("socialComments")
          .withIndex("by_post_parent", (q) =>
            q
              .eq("postId", post._id)
              .eq("parentId", target._id)
              .eq("status", args.hidden ? "published" : "hidden"),
          )
          .filter((q) => args.hidden || q.eq(q.field("hiddenByParent"), true))
          .collect();
        affectedReplies = replies.length;
        for (const reply of replies) {
          await ctx.db.patch(reply._id, {
            status,
            ...(args.hidden ? { hiddenByParent: true } : { hiddenByParent: undefined }),
            updatedAt: Date.now(),
          });
        }
      }
      if (post)
        await ctx.db.patch(post._id, {
          commentCount: Math.max(
            0,
            post.commentCount + (args.hidden ? -1 : 1) * (1 + affectedReplies),
          ),
        });
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
    workplace: v.string(),
    availability: v.optional(v.string()),
    skills: v.array(v.string()),
    links: v.array(v.string()),
    workHistory: v.array(
      v.object({
        title: v.string(),
        company: v.string(),
        startDate: v.string(),
        endDate: v.optional(v.string()),
        description: v.string(),
      }),
    ),
    certificates: v.array(
      v.object({
        name: v.string(),
        issuer: v.string(),
        issuedAt: v.optional(v.string()),
        details: v.string(),
        url: v.optional(v.string()),
      }),
    ),
    portfolio: v.array(
      v.object({
        title: v.string(),
        details: v.string(),
        url: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    if (!user || !args.name.trim())
      throw new Error("Sign in and enter a name to save your profile.");
    const prior = await ctx.db
      .query("socialProfiles")
      .withIndex("by_author", (q) => q.eq("authorId", user._id))
      .unique();
    if (args.name.trim().length > 100 || args.headline.length > 220 || args.about.length > 4_000)
      throw new Error("Profile name, headline or introduction is too long.");
    if (
      args.workplace.length > 160 ||
      (args.availability?.length ?? 0) > 120 ||
      args.skills.length > 40 ||
      args.links.length > 20
    )
      throw new Error("Too many profile entries.");
    if (args.workHistory.length > 30 || args.certificates.length > 30 || args.portfolio.length > 30)
      throw new Error("Too many work history, certificate or portfolio entries.");
    const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    const limit = (value: string, maximum: number, field: string) => {
      if (value.length > maximum) throw new Error(`${field} is too long.`);
      return value.trim();
    };
    if (args.skills.some((skill) => !skill.trim() || skill.length > 60))
      throw new Error("Skills must be 60 characters or fewer.");
    const workHistory = args.workHistory.map((item) => {
      if (!validMonth(item.startDate) || (item.endDate && !validMonth(item.endDate)))
        throw new Error("Work history dates must use YYYY-MM.");
      return {
        title: limit(item.title, 140, "Job title"),
        company: limit(item.company, 140, "Company name"),
        startDate: item.startDate,
        ...(item.endDate ? { endDate: item.endDate } : {}),
        description: limit(item.description, 3_000, "Work description"),
      };
    });
    const certificates = args.certificates.map((item) => {
      if (item.issuedAt && !validMonth(item.issuedAt))
        throw new Error("Certificate dates must use YYYY-MM.");
      return {
        name: limit(item.name, 160, "Certificate name"),
        issuer: limit(item.issuer, 140, "Certificate issuer"),
        ...(item.issuedAt ? { issuedAt: item.issuedAt } : {}),
        details: limit(item.details, 2_000, "Certificate details"),
        ...(item.url ? { url: safeUrl(item.url) } : {}),
      };
    });
    const portfolio = args.portfolio.map((item) => ({
      title: limit(item.title, 160, "Portfolio title"),
      details: limit(item.details, 3_000, "Portfolio details"),
      ...(item.url ? { url: safeUrl(item.url) } : {}),
      ...(item.imageUrl ? { imageUrl: safeUrl(item.imageUrl) } : {}),
    }));
    const record = {
      authorId: user._id,
      name: args.name.trim(),
      headline: args.headline.trim(),
      about: args.about.trim(),
      workplace: args.workplace.trim(),
      availability: args.availability?.trim() ?? "",
      skills: args.skills.map((skill) => skill.trim()),
      links: args.links.map(safeUrl),
      workHistory,
      certificates,
      portfolio,
      ...(prior?.avatarStorageId ? { avatarStorageId: prior.avatarStorageId } : {}),
      ...(prior?.coverStorageId ? { coverStorageId: prior.coverStorageId } : {}),
      ...(prior?.avatarUrl ? { avatarUrl: prior.avatarUrl } : {}),
      ...(prior?.coverUrl ? { coverUrl: prior.coverUrl } : {}),
    };
    if (prior) await ctx.db.replace(prior._id, record);
    else await ctx.db.insert("socialProfiles", record);
  },
});

export const follow = mutation({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await participant(ctx, args.token);
    if (viewer._id === args.userId) throw new Error("You cannot follow yourself.");
    if (!(await ctx.db.get(args.userId))) throw new Error("Profile unavailable.");
    const prior = await ctx.db
      .query("socialFollows")
      .withIndex("by_pair", (q) => q.eq("followerId", viewer._id).eq("followedId", args.userId))
      .unique();
    if (prior) return prior._id;
    return ctx.db.insert("socialFollows", {
      followerId: viewer._id,
      followedId: args.userId,
      createdAt: Date.now(),
    });
  },
});

export const unfollow = mutation({
  args: { token: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await participant(ctx, args.token);
    const prior = await ctx.db
      .query("socialFollows")
      .withIndex("by_pair", (q) => q.eq("followerId", viewer._id).eq("followedId", args.userId))
      .unique();
    if (prior) await ctx.db.delete(prior._id);
  },
});
export const deleteProfile = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await participant(ctx, token);
    const profile = await ctx.db
      .query("socialProfiles")
      .withIndex("by_author", (q) => q.eq("authorId", user._id))
      .unique();
    if (!profile) return;
    if (profile.avatarStorageId) await ctx.storage.delete(profile.avatarStorageId);
    if (profile.coverStorageId) await ctx.storage.delete(profile.coverStorageId);
    await ctx.db.delete(profile._id);
  },
});
