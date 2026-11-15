import { v } from "convex/values";

import { internalMutation, internalQuery, mutation } from "../_generated/server";
import { participant } from "./auth";
import { requestKey } from "./helpers";

// Transport chunk size, not a file-size or attachment-count limit.
export const CHUNK_BYTES = 4 * 1024 * 1024;
export const MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "text/plain",
];
export const begin = mutation({
  args: {
    token: v.string(),
    postId: v.id("socialPosts"),
    requestId: v.string(),
    name: v.string(),
    mime: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    requestKey(args.requestId);
    const post = await ctx.db.get(args.postId);
    if (
      !post ||
      post.authorId !== user._id ||
      !["draft", "published"].includes(post.status) ||
      (post.status === "published" && args.mime !== "text/plain")
    )
      throw new Error("Cannot upload to this post.");
    if (!MIME_TYPES.includes(args.mime) || !Number.isSafeInteger(args.size) || args.size <= 0)
      throw new Error("Choose a nonempty JPEG, PNG, GIF, WebP, MP4, WebM or text file.");
    const prior = await ctx.db
      .query("socialMedia")
      .withIndex("by_request", (q) => q.eq("authorId", user._id).eq("requestId", args.requestId))
      .unique();
    if (prior) {
      if (
        prior.postId !== args.postId ||
        prior.size !== args.size ||
        prior.mime !== args.mime ||
        prior.removed
      )
        throw new Error("Upload key was already used.");
      return prior._id;
    }
    await ctx.db.patch(post._id, { pendingMedia: post.pendingMedia + 1 });
    return ctx.db.insert("socialMedia", {
      authorId: user._id,
      postId: post._id,
      requestId: args.requestId,
      name: args.name,
      mime: args.mime,
      size: args.size,
      received: 0,
      complete: false,
      removed: false,
      expiresAt: Date.now() + 24 * 60 * 60_000,
    });
  },
});
export const uploadContext = internalQuery({
  args: { token: v.string(), mediaId: v.id("socialMedia") },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const media = await ctx.db.get(args.mediaId);
    const post = media ? await ctx.db.get(media.postId) : null;
    if (
      !media ||
      media.authorId !== user._id ||
      media.removed ||
      media.expiresAt <= Date.now() ||
      !post ||
      !["draft", "published"].includes(post.status)
    )
      throw new Error("Upload unavailable.");
    return media;
  },
});
export const acceptChunk = internalMutation({
  args: {
    token: v.string(),
    mediaId: v.id("socialMedia"),
    index: v.number(),
    storageId: v.id("_storage"),
    size: v.number(),
    preview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const m = await ctx.db.get(args.mediaId);
    const post = m ? await ctx.db.get(m.postId) : null;
    if (
      !m ||
      m.authorId !== user._id ||
      m.removed ||
      m.expiresAt <= Date.now() ||
      !post ||
      !["draft", "published"].includes(post.status)
    )
      throw new Error("Upload unavailable.");
    if (
      !Number.isSafeInteger(args.index) ||
      args.index < 0 ||
      args.index >= Math.ceil(m.size / CHUNK_BYTES) ||
      args.size !== Math.min(CHUNK_BYTES, m.size - args.index * CHUNK_BYTES)
    )
      throw new Error("Invalid chunk.");
    const prior = await ctx.db
      .query("socialChunks")
      .withIndex("by_media", (q) => q.eq("mediaId", m._id).eq("index", args.index))
      .unique();
    if (prior) {
      await ctx.storage.delete(args.storageId);
      return;
    }
    await ctx.db.insert("socialChunks", {
      mediaId: m._id,
      index: args.index,
      storageId: args.storageId,
    });
    const received = m.received + args.size;
    const complete = received === m.size;
    await ctx.db.patch(m._id, {
      received,
      complete,
      ...(args.preview !== undefined ? { preview: args.preview } : {}),
    });
    if (complete)
      await ctx.db.patch(post._id, {
        pendingMedia: post.pendingMedia - 1,
        mediaCount: post.mediaCount + (m.mime === "text/plain" ? 0 : 1),
      });
  },
});
export const remove = mutation({
  args: { token: v.string(), mediaId: v.id("socialMedia") },
  handler: async (ctx, args) => {
    const user = await participant(ctx, args.token);
    const m = await ctx.db.get(args.mediaId);
    if (!m || m.authorId !== user._id) throw new Error("Only the uploader can remove media.");
    if (m.removed) return;
    const post = await ctx.db.get(m.postId);
    if (!post || post.status !== "draft") throw new Error("Published media cannot be detached.");
    await ctx.db.patch(m._id, { removed: true, expiresAt: 0 });
    await ctx.db.patch(post._id, {
      pendingMedia: post.pendingMedia - (m.complete ? 0 : 1),
      mediaCount: post.mediaCount - (m.complete && m.mime !== "text/plain" ? 1 : 0),
    });
  },
});
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("socialMedia")
      .withIndex("by_expiry", (q) => q.lte("expiresAt", Date.now()))
      .take(50);
    for (const m of rows) {
      const p = await ctx.db.get(m.postId);
      if (
        p &&
        ["published", "hidden"].includes(p.status) &&
        !m.removed &&
        m.complete &&
        (m.mime !== "text/plain" || p.bodyId === m._id)
      ) {
        await ctx.db.patch(m._id, { expiresAt: Date.now() + 24 * 60 * 60_000 });
        continue;
      }
      // Expired draft media must not subsequently be published while chunks are being removed.
      if (!m.removed) {
        await ctx.db.patch(m._id, { removed: true });
        if (p?.status === "draft") await ctx.db.patch(p._id, { status: "deleted" });
        else if (p && !m.complete) await ctx.db.patch(p._id, { pendingMedia: p.pendingMedia - 1 });
      }
      const chunks = await ctx.db
        .query("socialChunks")
        .withIndex("by_media", (q) => q.eq("mediaId", m._id))
        .take(20);
      for (const chunk of chunks) {
        await ctx.storage.delete(chunk.storageId);
        await ctx.db.delete(chunk._id);
      }
      if (chunks.length < 20) await ctx.db.delete(m._id);
    }
    const nonces = await ctx.db
      .query("socialNonces")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .take(100);
    for (const nonce of nonces) await ctx.db.delete(nonce._id);
  },
});
