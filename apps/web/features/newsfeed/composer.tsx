"use client";
import { api, type TConvexId } from "@repo/convex-client";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useConvex } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { uploadMedia } from "./media-client";
import { useSocialSession } from "./session";

type DraftFile = {
  key: string;
  file: File;
  preview: string;
  id?: TConvexId<"socialMedia">;
  progress: number;
};
export function Composer({
  originalId,
  onDone,
}: {
  originalId?: TConvexId<"socialPosts">;
  onDone?: () => void;
}) {
  const { token, viewer } = useSocialSession();
  const client = useConvex();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(crypto.randomUUID());
  const postId = useRef<TConvexId<"socialPosts"> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const textUpload = useRef<{ text: string; key: string; id?: TConvexId<"socialMedia"> } | null>(
    null,
  );
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const urls = previews.current;
    return () => {
      abort.current?.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  if (!token || !viewer) return null;
  async function remove(file: DraftFile) {
    try {
      if (postId.current) {
        // Obtain the same upload record even when a previous upload failed before returning its ID.
        const id =
          file.id ??
          (await client.query(api.newsfeed.queries.uploadByRequest, { token, requestId: file.key }))
            ?._id;
        if (id) await client.mutation(api.newsfeed.media.remove, { token, mediaId: id });
      }
      URL.revokeObjectURL(file.preview);
      previews.current.delete(file.preview);
      setFiles((current) => current.filter((f) => f.key !== file.key));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove upload.");
    }
  }
  async function publish() {
    if (busy) return;
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      postId.current ??= await client.mutation(api.newsfeed.mutations.beginPost, {
        token,
        requestId: request.current,
        ...(originalId ? { originalId } : {}),
      });
      const id = postId.current;
      for (const file of files) {
        if (file.id) continue;
        const mediaId = await uploadMedia(client, {
          token,
          postId: id,
          requestId: file.key,
          file: file.file,
          signal: abort.current.signal,
          onProgress: (progress) =>
            setFiles((current) =>
              current.map((f) => (f.key === file.key ? { ...f, progress } : f)),
            ),
        });
        setFiles((current) => current.map((f) => (f.key === file.key ? { ...f, id: mediaId } : f)));
      }
      if (textUpload.current && textUpload.current.text !== body) {
        const old = textUpload.current;
        const oldId =
          old.id ??
          (await client.mutation(api.newsfeed.media.begin, {
            token,
            postId: id,
            requestId: old.key,
            name: "post.txt",
            mime: "text/plain",
            size: new Blob([old.text]).size,
          }));
        await client.mutation(api.newsfeed.media.remove, { token, mediaId: oldId });
        textUpload.current = null;
      }
      let bodyId;
      if (body.trim()) {
        textUpload.current ??= { text: body, key: crypto.randomUUID() };
        bodyId =
          textUpload.current.id ??
          (await uploadMedia(client, {
            token,
            postId: id,
            requestId: textUpload.current.key,
            file: new File([body], "post.txt", { type: "text/plain" }),
            signal: abort.current.signal,
            onProgress: () => {},
          }));
        textUpload.current.id = bodyId;
      }
      await client.mutation(api.newsfeed.mutations.publish, {
        token,
        postId: id,
        ...(bodyId ? { bodyId } : {}),
      });
      for (const file of files) URL.revokeObjectURL(file.preview);
      previews.current.clear();
      setBody("");
      setFiles([]);
      postId.current = null;
      textUpload.current = null;
      request.current = crypto.randomUUID();
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish. Your draft is retained.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={originalId ? "Repost composer" : "Create a post"}
      className="hr-card-surface space-y-4 p-4 sm:p-5"
    >
      <label className="block font-medium">
        {originalId ? "Add your perspective" : "Share an update"}
        <Textarea
          className="mt-2 min-h-28 resize-y"
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What are you working on?"
        />
      </label>
      <label htmlFor="newsfeed-media-upload" className="block text-sm">
        Photos or videos
        <Input
          id="newsfeed-media-upload"
          className="mt-1 h-auto py-2"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
          disabled={busy}
          onChange={(e) => {
            const added = Array.from(e.target.files ?? []).map((file) => {
              const preview = URL.createObjectURL(file);
              previews.current.add(preview);
              return { key: crypto.randomUUID(), file, preview, progress: 0 };
            });
            setFiles((current) => [...current, ...added]);
            e.target.value = "";
          }}
        />
      </label>
      <ul className="grid grid-cols-2 gap-3">
        {files.map((file) => (
          <li key={file.key} className="min-w-0 rounded border p-2">
            {file.file.type.startsWith("image/") ? (
              <img src={file.preview} alt={file.file.name} className="max-h-36 object-contain" />
            ) : (
              <video src={file.preview} controls preload="metadata" className="max-h-36">
                <track kind="captions" />
              </video>
            )}
            <p className="text-sm break-words">{file.file.name}</p>
            <progress
              aria-label={`Uploading ${file.file.name}`}
              max={100}
              value={file.progress}
              className="w-full"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void remove(file)}
              className="px-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Uploads can be retried. Very large media may exceed your browser’s memory when viewed. Draft
        uploads expire after 24 hours.
      </p>
      <Button
        className="hr-v2-button-primary px-4 disabled:opacity-50"
        type="button"
        disabled={busy || (!body.trim() && !files.length && !originalId)}
        onClick={publish}
      >
        {busy ? "Publishing…" : error ? "Retry publishing" : originalId ? "Repost" : "Publish"}
      </Button>
      {busy && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-2"
          onClick={() => abort.current?.abort()}
        >
          Cancel upload
        </Button>
      )}
    </section>
  );
}
