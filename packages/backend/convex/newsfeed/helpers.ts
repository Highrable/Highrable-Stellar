import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
export async function author(ctx: QueryCtx, id: Id<"users">) {
  const [user, profile] = await Promise.all([
    ctx.db.get(id),
    ctx.db
      .query("socialProfiles")
      .withIndex("by_author", (q) => q.eq("authorId", id))
      .unique(),
  ]);
  return {
    id,
    name: profile?.name || user?.name?.trim() || "Highrable participant",
    avatarUrl:
      (profile?.avatarStorageId ? await ctx.storage.getUrl(profile.avatarStorageId) : null) ??
      profile?.avatarUrl ??
      (user?.avatarStorageId ? await ctx.storage.getUrl(user.avatarStorageId) : user?.avatarUrl) ??
      null,
    headline: profile?.headline ?? "",
  };
}
export async function published(ctx: QueryCtx, id: Id<"socialPosts">) {
  const post = await ctx.db.get(id);
  if (!post || post.status !== "published") throw new Error("Post unavailable.");
  return post;
}
async function cardContent(ctx: QueryCtx, post: Doc<"socialPosts">) {
  const [body, postAuthor, media] = await Promise.all([
    post.bodyId ? ctx.db.get(post.bodyId) : null,
    author(ctx, post.authorId),
    post.mediaCount
      ? ctx.db
          .query("socialMedia")
          .withIndex("by_post", (q) =>
            q.eq("postId", post._id).eq("removed", false).eq("complete", true),
          )
          .filter((q) => q.neq(q.field("mime"), "text/plain"))
          .take(4)
      : [],
  ]);
  return {
    ...post,
    author: postAuthor,
    preview: body?.preview ?? "",
    bodySize: body?.size ?? 0,
    media: media.map(({ _id, name, mime, size }) => ({ _id, name, mime, size })),
  };
}
export async function card(ctx: QueryCtx, post: Doc<"socialPosts">, viewerId?: Id<"users">) {
  const [content, original, reaction] = await Promise.all([
    cardContent(ctx, post),
    post.originalId ? ctx.db.get(post.originalId) : null,
    viewerId
      ? ctx.db
          .query("socialReactions")
          .withIndex("by_post_author", (q) => q.eq("postId", post._id).eq("authorId", viewerId))
          .unique()
      : null,
  ]);
  return {
    ...content,
    viewerReaction: reaction?.kind ?? null,
    original: original?.status === "published" ? await cardContent(ctx, original) : null,
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
