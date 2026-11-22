"use client";
import { api, type TConvexId } from "@repo/convex-client";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useConvex } from "convex/react";
import { ImagePlus, Smile, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ImageEditor } from "./image-editor";
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
  const [open, setOpen] = useState(Boolean(originalId));
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingImageKey, setEditingImageKey] = useState<string | null>(null);
  const request = useRef(crypto.randomUUID());
  const postId = useRef<TConvexId<"socialPosts"> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const textUpload = useRef<{ text: string; key: string; id?: TConvexId<"socialMedia"> } | null>(
    null,
  );
  const previews = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
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
  function addFiles(list: FileList | null) {
    const added = Array.from(list ?? []).map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { key: crypto.randomUUID(), file, preview, progress: 0 };
    });
    setFiles((current) => [...current, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  }
  function applyImageEdits(key: string, edited: File) {
    setFiles((current) =>
      current.map((file) => {
        if (file.key !== key) return file;
        URL.revokeObjectURL(file.preview);
        previews.current.delete(file.preview);
        const preview = URL.createObjectURL(edited);
        previews.current.add(preview);
        return { ...file, file: edited, preview, progress: 0 };
      }),
    );
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
      setOpen(false);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish. Your draft is retained.");
    } finally {
      setBusy(false);
    }
  }
  const displayName = viewer.name?.trim() || "your community";
  const form = (
    <div className="space-y-4">
      <label className="block font-medium">
        {originalId ? "Add your perspective" : "Share an update"}
        <Textarea
          id="newsfeed-post-text"
          className="mt-2 min-h-32 resize-y"
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          placeholder={originalId ? "What do you think about this?" : "What are you working on?"}
        />
      </label>
      <div className="rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Add to your post</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus aria-hidden="true" className="mr-1.5 size-4 text-emerald-600" /> Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              <Video aria-hidden="true" className="mr-1.5 size-4 text-rose-600" /> Video
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("newsfeed-post-text")?.focus()}
            >
              <Smile aria-hidden="true" className="mr-1.5 size-4 text-amber-600" /> Feeling
            </Button>
          </div>
        </div>
        <Input
          ref={fileInput}
          id="newsfeed-media-upload"
          aria-label="Choose post photos or videos"
          className="sr-only"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
          disabled={busy}
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {files.map((file) => (
          <li key={file.key} className="min-w-0 rounded-xl border bg-muted/20 p-2">
            {file.file.type.startsWith("image/") ? (
              <img
                src={file.preview}
                alt={file.file.name}
                className="h-32 w-full rounded-md object-cover"
              />
            ) : (
              <video
                src={file.preview}
                controls
                preload="metadata"
                className="h-32 w-full object-contain"
              >
                <track kind="captions" />
              </video>
            )}
            <p className="mt-2 truncate text-xs" title={file.file.name}>
              {file.file.name}
            </p>
            {file.file.type.startsWith("image/") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || Boolean(file.id)}
                onClick={() => setEditingImageKey(file.key)}
                className="mt-2 h-8 w-full"
              >
                Edit image
              </Button>
            )}
            <progress
              aria-label={`Uploading ${file.file.name}`}
              max={100}
              value={file.progress}
              className="mt-2 w-full"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void remove(file)}
              className="mt-1 h-7 px-1 text-xs text-muted-foreground"
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ImageEditor
        file={files.find((file) => file.key === editingImageKey)?.file ?? null}
        onOpenChange={(open) => {
          if (!open) setEditingImageKey(null);
        }}
        onSave={(edited) => {
          if (editingImageKey) applyImageEdits(editingImageKey, edited);
          setEditingImageKey(null);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Failed uploads can be retried. Your draft stays here if you close this window.
      </p>
      <div className="flex items-center justify-end gap-2">
        {busy && (
          <Button type="button" variant="ghost" size="sm" onClick={() => abort.current?.abort()}>
            Cancel upload
          </Button>
        )}
        <Button
          className="hr-v2-button-primary px-5 disabled:opacity-50"
          type="button"
          disabled={busy || (!body.trim() && !files.length && !originalId)}
          onClick={() => void publish()}
        >
          {busy ? "Publishing…" : error ? "Retry publishing" : originalId ? "Repost" : "Publish"}
        </Button>
      </div>
    </div>
  );
  return (
    <>
      {!originalId && (
        <section aria-label="Create a post" className="hr-card-surface p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-3 text-left"
            aria-label="Open post composer"
          >
            <Avatar className="size-11">
              <AvatarImage src={viewer.avatarUrl ?? undefined} alt="" />
              <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="flex-1 rounded-full bg-muted px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/80">
              What’s on your mind, {displayName.split(" ")[0]}?
            </span>
          </button>
          <div className="mt-3 flex border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setOpen(true);
                setTimeout(() => fileInput.current?.click(), 100);
              }}
            >
              <Video className="mr-2 size-4 text-rose-600" /> Video
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setOpen(true);
                setTimeout(() => fileInput.current?.click(), 100);
              }}
            >
              <ImagePlus className="mr-2 size-4 text-emerald-600" /> Photo
            </Button>
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setOpen(true)}>
              <Smile className="mr-2 size-4 text-amber-600" /> Feeling
            </Button>
          </div>
        </section>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && originalId) onDone?.();
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{originalId ? "Repost" : "Create post"}</DialogTitle>
            <DialogDescription>Share an update with the Highrable community.</DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
    </>
  );
}
