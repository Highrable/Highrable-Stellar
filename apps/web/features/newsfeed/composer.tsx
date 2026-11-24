"use client";
import { api, type TConvexId } from "@repo/convex-client";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@repo/ui/responsive-dialog";
import { useConvex, useQuery } from "convex/react";
import { ArrowRight, ImagePlus, Maximize2, Tags, Video } from "lucide-react";
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
  const milestones = useQuery(api.newsfeed.queries.myMilestones, token ? { token } : "skip");
  const tagSuggestions = useQuery(api.newsfeed.queries.trendingTags, {});
  const [open, setOpen] = useState(Boolean(originalId));
  const [body, setBody] = useState("");
  const [tagText, setTagText] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [milestoneConfirmed, setMilestoneConfirmed] = useState(false);
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
        tags: tagText
          .split(/[\s,]+/)
          .map((tag) => tag.trim().replace(/^#/, ""))
          .filter(Boolean),
        ...(milestoneId
          ? { milestoneId: milestoneId as TConvexId<"milestones">, milestoneConfirmed }
          : {}),
      });
      for (const file of files) URL.revokeObjectURL(file.preview);
      previews.current.clear();
      setBody("");
      setTagText("");
      setMilestoneId("");
      setMilestoneConfirmed(false);
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
  const selectedMilestone = milestones?.find((milestone) => milestone.id === milestoneId);
  const selectedTags = tagText
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, ""))
    .filter(Boolean);

  function toggleTag(tag: string) {
    const next = selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase())
      ? selectedTags.filter((item) => item.toLowerCase() !== tag.toLowerCase())
      : [...selectedTags, tag].slice(0, 5);
    setTagText(next.join(", "));
  }
  const form = (
    <>
      <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-11 border-2 border-orange-200">
              <AvatarImage src={viewer.avatarUrl ?? undefined} alt="" />
              <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {viewer.availability || "Highrable freelance network"}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <span aria-hidden="true">◉</span> Public · Freelance Network
          </span>
        </div>
        <label className="block font-medium">
          {originalId ? "Add your perspective" : "Share an update"}
          <Textarea
            id="newsfeed-post-text"
            className="mt-2 min-h-28 resize-y rounded-xl border-slate-200 bg-background px-4 py-3 text-base leading-6 dark:border-slate-700"
            value={body}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
            placeholder={originalId ? "What do you think about this?" : "What are you working on?"}
          />
        </label>
        {files.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            {files.map((file) => (
              <li
                key={file.key}
                className="min-w-0 rounded-xl border bg-slate-50 p-2 dark:bg-slate-900"
              >
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
        )}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
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
                onClick={() => document.getElementById("newsfeed-post-tags")?.focus()}
              >
                <Tags aria-hidden="true" className="mr-1.5 size-4 text-orange-600" /> Tags
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById("newsfeed-milestone")?.focus()}
              >
                <span aria-hidden="true" className="mr-1.5 text-orange-600">
                  ✺
                </span>{" "}
                Milestone
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
        {!originalId && (
          <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
            <label className="block text-sm font-medium" htmlFor="newsfeed-post-tags">
              Tags
              <Input
                id="newsfeed-post-tags"
                value={tagText}
                onChange={(event) => setTagText(event.target.value)}
                disabled={busy}
                placeholder="Figma, DesignSystems"
                className="mt-1"
                aria-describedby="newsfeed-post-tags-help"
              />
              <span
                id="newsfeed-post-tags-help"
                className="mt-1 block text-xs text-muted-foreground"
              >
                Add up to five tags, separated by commas or spaces.
              </span>
              {!!tagSuggestions?.length && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {tagSuggestions
                    .flatMap(({ tag }) => (typeof tag === "string" && tag ? [tag] : []))
                    .slice(0, 5)
                    .map((tag) => {
                      const selected = selectedTags.some(
                        (item) => item.toLowerCase() === tag.toLowerCase(),
                      );
                      return (
                        <button
                          key={tag}
                          type="button"
                          aria-pressed={selected}
                          disabled={busy}
                          onClick={() => toggleTag(tag)}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? "bg-orange-600 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-700 dark:bg-slate-800 dark:text-slate-200"
                          }`}
                        >
                          #{tag}
                        </button>
                      );
                    })}
                </span>
              )}
            </label>
            <label className="block text-sm font-medium" htmlFor="newsfeed-milestone">
              Attach a milestone (optional)
              <select
                id="newsfeed-milestone"
                value={milestoneId}
                onChange={(event) => {
                  setMilestoneId(event.target.value);
                  setMilestoneConfirmed(false);
                }}
                disabled={busy || milestones === undefined || !milestones.length}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">No milestone</option>
                {milestones?.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title} · {milestone.status}
                  </option>
                ))}
              </select>
              {milestones?.length === 0 && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  No participant milestones are available to attach.
                </span>
              )}
            </label>
            {selectedMilestone && (
              <label className="flex items-start gap-2 rounded-lg bg-orange-50 p-3 text-sm text-orange-950 sm:col-span-2 dark:bg-orange-950/30 dark:text-orange-100">
                <input
                  type="checkbox"
                  checked={milestoneConfirmed}
                  onChange={(event) => setMilestoneConfirmed(event.target.checked)}
                  disabled={busy}
                  className="mt-1 accent-orange-600"
                />
                <span>
                  I confirm this public post may show “{selectedMilestone.title}” and its current
                  status (“{selectedMilestone.status}”). Amounts, files, and agreement details will
                  stay private.
                </span>
              </label>
            )}
          </div>
        )}
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
      </div>
      <footer className="flex items-center justify-between gap-3 border-t bg-slate-50 px-6 py-4 dark:bg-slate-900">
        <p className="text-xs text-muted-foreground">
          Failed uploads can be retried. Your draft stays in this window until you publish.
        </p>
        <div className="flex items-center gap-2">
          {busy && (
            <Button type="button" variant="ghost" size="sm" onClick={() => abort.current?.abort()}>
              Cancel upload
            </Button>
          )}
          <Button
            className="hr-v2-button-primary px-5 disabled:opacity-50"
            type="button"
            disabled={
              busy ||
              (!body.trim() && !files.length && !originalId) ||
              Boolean(milestoneId && !milestoneConfirmed)
            }
            onClick={() => void publish()}
          >
            {busy
              ? "Publishing…"
              : error
                ? "Retry publishing"
                : originalId
                  ? "Repost"
                  : "Publish Update"}
            {!busy && !error && !originalId && (
              <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            )}
          </Button>
        </div>
      </footer>
    </>
  );
  return (
    <>
      {!originalId && (
        <section aria-label="Create a post" className="hr-card-surface rounded-2xl p-3 sm:p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void publish();
            }}
          >
            <div className="flex items-center gap-3">
              <Avatar className="size-11 shrink-0 border-2 border-orange-200">
                <AvatarImage src={viewer.avatarUrl ?? undefined} alt="" />
                <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <label htmlFor="newsfeed-quick-post-text" className="sr-only">
                Quick post
              </label>
              <Textarea
                id="newsfeed-quick-post-text"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={busy}
                rows={1}
                maxLength={1200}
                placeholder={`What are you working on or celebrating, ${displayName.split(" ")[0]}?`}
                className="min-h-11 flex-1 resize-none rounded-full border-slate-200 bg-slate-50 px-4 py-2.5 text-sm leading-5 dark:border-slate-700 dark:bg-slate-900"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open post composer"
                title="Open full post composer"
                onClick={() => setOpen(true)}
                className="shrink-0 text-slate-500"
              >
                <Maximize2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(true);
                  setTimeout(() => fileInput.current?.click(), 100);
                }}
              >
                <ImagePlus className="mr-1.5 size-4 text-emerald-600" /> Photo/Video
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(true);
                  setTimeout(() => document.getElementById("newsfeed-milestone")?.focus(), 100);
                }}
              >
                <span aria-hidden="true" className="mr-1.5 text-orange-600">
                  ✺
                </span>{" "}
                Milestone
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(true);
                  setTimeout(() => document.getElementById("newsfeed-post-tags")?.focus(), 100);
                }}
              >
                <Tags className="mr-1.5 size-4 text-blue-600" /> Tags
              </Button>
              <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
                Public · Freelance Network
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={busy || !body.trim() || Boolean(milestoneId && !milestoneConfirmed)}
                className="hr-v2-button-primary ml-auto px-4 sm:ml-0"
              >
                {busy ? "Publishing…" : error ? "Retry" : "Publish"}
              </Button>
            </div>
          </form>
          {error && (
            <p role="alert" className="px-1 pt-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {files.length > 0 && (
            <p className="px-1 pt-2 text-xs text-muted-foreground">
              {files.length} media {files.length === 1 ? "file" : "files"} attached
            </p>
          )}
        </section>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && originalId) onDone?.();
        }}
      >
        <DialogContent className="flex max-h-[min(94dvh,62rem)] max-w-[45rem] flex-col gap-0 overflow-hidden rounded-2xl border bg-background p-0">
          <DialogHeader className="border-b px-4 py-4 text-left sm:px-6 sm:py-5">
            <DialogTitle className="text-xl">{originalId ? "Repost" : "Create Post"}</DialogTitle>
            <DialogDescription className="text-sm">
              Share a milestone, deliverable, or update with your freelance network.
            </DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
    </>
  );
}
