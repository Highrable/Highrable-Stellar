import { defineTable } from "convex/server";
import { v } from "convex/values";

export const reactionKind = v.union(
  ...["Like", "Celebrate", "Support", "Love", "Insightful", "Funny"].map(v.literal),
);
export const visibility = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("hidden"),
  v.literal("deleted"),
);
export const socialTables = {
  socialNonces: defineTable({ nonce: v.string(), expiresAt: v.number() })
    .index("by_nonce", ["nonce"])
    .index("by_expiry", ["expiresAt"]),
  socialPosts: defineTable({
    authorId: v.id("users"),
    requestId: v.string(),
    status: visibility,
    bodyId: v.optional(v.id("socialMedia")),
    originalId: v.optional(v.id("socialPosts")),
    reactionCount: v.number(),
    commentCount: v.number(),
    mediaCount: v.number(),
    pendingMedia: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_status", ["status", "publishedAt"])
    .index("by_author", ["authorId", "status", "publishedAt"])
    .index("by_request", ["authorId", "requestId"]),
  socialMedia: defineTable({
    authorId: v.id("users"),
    postId: v.optional(v.id("socialPosts")),
    storyId: v.optional(v.id("socialStories")),
    requestId: v.string(),
    name: v.string(),
    mime: v.string(),
    size: v.number(),
    received: v.number(),
    complete: v.boolean(),
    removed: v.boolean(),
    preview: v.optional(v.string()),
    expiresAt: v.number(),
  })
    .index("by_post", ["postId", "removed", "complete"])
    .index("by_story", ["storyId", "removed", "complete"])
    .index("by_request", ["authorId", "requestId"])
    .index("by_expiry", ["expiresAt"]),
  socialChunks: defineTable({
    mediaId: v.id("socialMedia"),
    index: v.number(),
    storageId: v.id("_storage"),
  }).index("by_media", ["mediaId", "index"]),
  socialStories: defineTable({
    authorId: v.id("users"),
    requestId: v.string(),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("deleted")),
    mediaCount: v.number(),
    pendingMedia: v.number(),
    reactionCount: v.number(),
    likeCount: v.number(),
    celebrateCount: v.number(),
    supportCount: v.number(),
    loveCount: v.number(),
    insightfulCount: v.number(),
    funnyCount: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
    expiresAt: v.number(),
  })
    .index("by_expiry", ["expiresAt"])
    .index("by_author_request", ["authorId", "requestId"]),
  socialStoryReactions: defineTable({
    storyId: v.id("socialStories"),
    authorId: v.id("users"),
    kind: reactionKind,
  })
    .index("by_story_author", ["storyId", "authorId"])
    .index("by_story", ["storyId"]),
  socialReactions: defineTable({
    postId: v.id("socialPosts"),
    authorId: v.id("users"),
    kind: reactionKind,
  }).index("by_post_author", ["postId", "authorId"]),
  socialComments: defineTable({
    postId: v.id("socialPosts"),
    authorId: v.id("users"),
    requestId: v.string(),
    body: v.string(),
    status: visibility,
    updatedAt: v.number(),
  })
    .index("by_post", ["postId", "status"])
    .index("by_request", ["authorId", "requestId"]),
  socialReports: defineTable({
    authorId: v.id("users"),
    postId: v.optional(v.id("socialPosts")),
    commentId: v.optional(v.id("socialComments")),
    reason: v.string(),
  })
    .index("by_author_post", ["authorId", "postId"])
    .index("by_author_comment", ["authorId", "commentId"]),
  socialModeration: defineTable({
    moderator: v.string(),
    target: v.string(),
    hidden: v.boolean(),
    reason: v.string(),
  }),
  socialProfiles: defineTable({
    authorId: v.id("users"),
    name: v.string(),
    headline: v.string(),
    about: v.string(),
    skills: v.array(v.string()),
    links: v.array(v.string()),
    coverUrl: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  }).index("by_author", ["authorId"]),
};
