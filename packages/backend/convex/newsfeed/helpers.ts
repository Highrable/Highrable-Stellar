import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
export async function author(ctx: QueryCtx, id: Id<"users">) {
  const user = await ctx.db.get(id);
  const profile = await ctx.db
    .query("socialProfiles")
    .withIndex("by_author", (q) => q.eq("authorId", id))
    .unique();
  return {
    id,
    name: profile?.name || user?.name?.trim() || "Highrable participant",
    avatarUrl:
      profile?.avatarUrl ??
      (user?.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : user?.avatarUrl) ??
      null,
    walletAddress: user?.walletAddress ?? "",
    role: user?.role ?? "freelancer",
  };
}
export async function published(ctx: QueryCtx, id: Id<"socialPosts">) {
  const post = await ctx.db.get(id);
  if (!post || post.status !== "published") throw new Error("Post unavailable.");
  return post;
}
export async function card(ctx: QueryCtx, post: Doc<"socialPosts">) {
  const body = post.bodyId ? await ctx.db.get(post.bodyId) : null;
  const original = post.originalId ? await ctx.db.get(post.originalId) : null;
  const originalBody =
    original?.status === "published" && original.bodyId ? await ctx.db.get(original.bodyId) : null;
  return {
    ...post,
    author: await author(ctx, post.authorId),
    preview: body?.preview ?? "",
    bodySize: body?.size ?? 0,
    original:
      original?.status === "published"
        ? {
            ...original,
            author: await author(ctx, original.authorId),
            preview: originalBody?.preview ?? "",
            bodySize: originalBody?.size ?? 0,
          }
        : null,
  };
}
export function requestKey(key: string) {
  if (!key.trim() || key.length > 128) throw new Error("Invalid request key.");
}
export function safeUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Use an HTTP or HTTPS link.");
  return url.href;
}
