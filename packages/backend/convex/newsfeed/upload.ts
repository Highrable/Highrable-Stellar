import type { Id } from "../_generated/dataModel";

import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { verifyToken } from "./auth";
import { CHUNK_BYTES } from "./media";

export function matchesContent(mime: string, bytes: Uint8Array) {
  const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
  if (mime === "text/plain") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
      return !bytes.includes(0);
    } catch {
      return false;
    }
  }
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png")
    return (
      bytes[0] === 137 &&
      ascii(1, 4) === "PNG" &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10
    );
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
  if (mime === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mime === "video/mp4") return ascii(4, 8) === "ftyp";
  return (
    mime === "video/webm" &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}
function headers(request: Request) {
  // Preflight carries no bearer token. POST independently binds its Origin to the signed session.
  const origin = request.headers.get("origin");
  if (
    !origin ||
    !["https:", "http:"].includes(new URL(origin).protocol) ||
    new URL(origin).origin !== origin
  )
    throw new Error("Origin is not allowed.");
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
export const preflight = httpAction(async (_ctx, req) => {
  try {
    return new Response(null, { status: 204, headers: headers(req) });
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
});
export const upload = httpAction(async (ctx, req) => {
  let cors: Record<string, string> = {};
  let stored: Id<"_storage"> | undefined;
  try {
    cors = headers(req);
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    await verifyToken(token, req.headers.get("origin")!);
    const url = new URL(req.url);
    const mediaId = url.searchParams.get("mediaId") as Id<"socialMedia">;
    const index = Number(url.searchParams.get("index"));
    const m = await ctx.runQuery(internal.newsfeed.media.uploadContext, { token, mediaId });
    if (!Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(m.size / CHUNK_BYTES))
      throw new Error("Invalid chunk index.");
    const blob = await req.blob();
    if (blob.size !== Math.min(CHUNK_BYTES, m.size - index * CHUNK_BYTES))
      throw new Error("Invalid chunk size.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (index === 0 && !matchesContent(m.mime, bytes))
      throw new Error("The file contents do not match the supported format.");
    stored = await ctx.storage.store(new Blob([bytes], { type: "application/octet-stream" }));
    await ctx.runMutation(internal.newsfeed.media.acceptChunk, {
      token,
      mediaId,
      index,
      storageId: stored,
      size: bytes.length,
      ...(index === 0 && m.mime === "text/plain"
        ? { preview: new TextDecoder().decode(bytes).slice(0, 600) }
        : {}),
    });
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    if (stored) await ctx.storage.delete(stored);
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed. Retry this chunk." },
      { status: 400, headers: cors },
    );
  }
});
export const profileImage = httpAction(async (ctx, req) => {
  let cors: Record<string, string> = {};
  let stored: Id<"_storage"> | undefined;
  try {
    cors = headers(req);
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    await verifyToken(token, req.headers.get("origin")!);
    const purpose = new URL(req.url).searchParams.get("purpose");
    if (purpose !== "avatar" && purpose !== "cover")
      throw new Error("Choose an avatar or cover image.");
    const mime = req.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime))
      throw new Error("Choose a JPEG, PNG, GIF or WebP image.");
    const blob = await req.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!bytes.length || !matchesContent(mime, bytes))
      throw new Error("The image contents do not match the selected format.");
    stored = await ctx.storage.store(new Blob([bytes], { type: mime }));
    await ctx.runMutation(internal.newsfeed.media.saveProfileImage, {
      token,
      purpose,
      storageId: stored,
    });
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    if (stored) await ctx.storage.delete(stored);
    return Response.json(
      { error: error instanceof Error ? error.message : "Profile image upload failed." },
      { status: 400, headers: cors },
    );
  }
});
