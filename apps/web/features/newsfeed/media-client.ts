import { api, type TConvexId } from "@repo/convex-client";

import type { ConvexReactClient } from "convex/react";
import type { FunctionReturnType } from "convex/server";
const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_MEDIA_DOWNLOADS = 3;
let activeDownloads = 0;
const downloadQueue: Array<() => void> = [];
async function withDownloadSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeDownloads >= MAX_MEDIA_DOWNLOADS)
    await new Promise<void>((resolve) => downloadQueue.push(resolve));
  else activeDownloads++;
  try {
    return await run();
  } finally {
    const next = downloadQueue.shift();
    if (next) next();
    else activeDownloads--;
  }
}
export async function uploadMedia(
  client: ConvexReactClient,
  input: {
    token: string;
    postId?: TConvexId<"socialPosts">;
    storyId?: TConvexId<"socialStories">;
    requestId: string;
    file: File;
    signal: AbortSignal;
    onProgress: (percent: number) => void;
  },
) {
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!site) throw new Error("Social upload hosting is not configured.");
  if (!!input.postId === !!input.storyId) throw new Error("Choose one upload target.");
  const mediaId = await client.mutation(api.newsfeed.media.begin, {
    token: input.token,
    ...(input.postId ? { postId: input.postId } : { storyId: input.storyId! }),
    requestId: input.requestId,
    name: input.file.name,
    mime: input.file.type,
    size: input.file.size,
  });
  for (let offset = 0; offset < input.file.size; offset += CHUNK_BYTES) {
    input.signal.throwIfAborted();
    const blob = input.file.slice(offset, offset + CHUNK_BYTES);
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      input.signal.addEventListener("abort", abort, { once: true });
      const done = () => input.signal.removeEventListener("abort", abort);
      xhr.open(
        "POST",
        `${site}/newsfeed/upload?mediaId=${encodeURIComponent(mediaId)}&index=${offset / CHUNK_BYTES}`,
      );
      xhr.setRequestHeader("Authorization", `Bearer ${input.token}`);
      xhr.upload.onprogress = (event) =>
        input.onProgress(Math.round(((offset + event.loaded) / input.file.size) * 100));
      xhr.onload = () => {
        done();
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let message = "Upload failed. Retry to resume.";
          try {
            message = JSON.parse(xhr.responseText).error ?? message;
          } catch {
            /* Hosting can return non-JSON errors. */
          }
          reject(new Error(message));
        }
      };
      xhr.onerror = () => {
        done();
        reject(new Error("Connection lost. Retry to resume."));
      };
      xhr.onabort = () => {
        done();
        reject(new Error("Upload cancelled. Your draft is retained."));
      };
      xhr.send(blob);
    });
  }
  input.onProgress(100);
  return mediaId;
}
export async function readMedia(
  client: ConvexReactClient,
  mediaId: TConvexId<"socialMedia">,
  mime: string,
) {
  return withDownloadSlot(async () => {
    const parts: Blob[] = [];
    let cursor: string | null = null;
    do {
      const result: FunctionReturnType<typeof api.newsfeed.queries.chunks> = await client.query(
        api.newsfeed.queries.chunks,
        { mediaId, paginationOpts: { cursor, numItems: 20 } },
      );
      for (const part of result.page) {
        if (!part.url) throw new Error("Media unavailable.");
        const response = await fetch(part.url);
        if (!response.ok) throw new Error("Media could not be loaded. Retry.");
        parts.push(await response.blob());
      }
      if (result.isDone) break;
      cursor = result.continueCursor;
    } while (cursor);
    return new Blob(parts, { type: mime });
  });
}
