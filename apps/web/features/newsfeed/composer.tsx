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
import { ArrowRight, Award, Hash, ImagePlus, Maximize2, Smile, Tags, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ComposerSectionLabel, MobileDialogClose, SuggestedTagChips } from "./composer-ui";
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
  function addEmoji() {
    setBody((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}😊`);
  }
  const postTags =
    tagSuggestions
      ?.flatMap(({ tag }) => (typeof tag === "string" && tag ? [tag] : []))
      .slice(0, 5) ?? [];
  const form = (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b bg-muted/15 px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-14 shrink-0 border-2 border-orange-200 sm:size-16">
            <AvatarImage src={viewer.avatarUrl ?? undefined} alt="" />
            <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="max-w-64 text-sm leading-5 font-bold sm:text-base">{displayName}</p>
            <p className="mt-0.5 line-clamp-2 text-[0.68rem] font-bold tracking-[0.07em] text-muted-foreground uppercase">
              {viewer.availability || "Highrable freelance network"}
            </p>
          </div>
        </div>
        <span className="inline-flex min-h-12 items-center gap-2.5 rounded-full border border-border/70 bg-background px-4 py-2 text-xs font-bold text-foreground shadow-sm sm:max-w-60">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-blue-500" />
          <span>Public · Freelance Network</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6">
        <label className="block space-y-2.5" htmlFor="newsfeed-post-text">
          <ComposerSectionLabel>
            {originalId ? "Add your perspective" : "Share an update"}
          </ComposerSectionLabel>
          <Textarea
            id="newsfeed-post-text"
            className="min-h-48 resize-y rounded-[1.5rem] border-transparent bg-muted/35 px-5 py-5 text-base leading-7 placeholder:text-muted-foreground/80 focus-visible:border-primary/30 sm:min-h-56 sm:px-6 sm:py-6"
            value={body}
            disabled={busy}
            onChange={(event) => setBody(event.target.value)}
            placeholder={originalId ? "What do you think about this?" : "What are you working on?"}
          />
        </label>
        {files.length > 0 && (
          <ul aria-label="Post uploads" className="grid grid-cols-2 gap-3">
            {files.map((file) => (
              <li key={file.key} className="min-w-0 rounded-2xl border bg-muted/25 p-2.5">
                {file.file.type.startsWith("image/") ? (
                  <img
                    src={file.preview}
                    alt={file.file.name}
                    className="h-32 w-full rounded-xl object-cover"
                  />
                ) : (
                  <video
                    src={file.preview}
                    controls
                    preload="metadata"
                    className="h-32 w-full rounded-xl bg-black object-contain"
                  >
                    <track kind="captions" />
                  </video>
                )}
                <p className="mt-2 truncate text-xs font-semibold" title={file.file.name}>
                  {file.file.name}
                </p>
                {file.file.type.startsWith("image/") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || Boolean(file.id)}
                    onClick={() => setEditingImageKey(file.key)}
                    className="mt-2 h-9 w-full rounded-full"
                  >
                    Edit image
                  </Button>
                )}
                <progress
                  aria-label={`Uploading ${file.file.name}`}
                  max={100}
                  value={file.progress}
                  className="mt-2 w-full accent-primary"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void remove(file)}
                  className="mt-1 h-8 rounded-full px-2 text-xs text-muted-foreground"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-3 rounded-[1.5rem] bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-[0.68rem] font-bold tracking-wide text-muted-foreground uppercase">
            Add to your post
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Add photo"
              title="Add photo"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="size-12 rounded-2xl bg-background shadow-sm"
            >
              <ImagePlus aria-hidden="true" className="size-5 text-emerald-600" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Add video"
              title="Add video"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="size-12 rounded-2xl bg-background shadow-sm"
            >
              <Video aria-hidden="true" className="size-5 text-rose-500" />
            </Button>
            {!originalId && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Add tags"
                title="Add tags"
                disabled={busy}
                onClick={() => document.getElementById("newsfeed-post-tags")?.focus()}
                className="size-12 rounded-2xl bg-background shadow-sm"
              >
                <Hash aria-hidden="true" className="size-5 text-orange-600" />
              </Button>
            )}
            {!originalId && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Attach a milestone"
                title="Attach a milestone"
                disabled={busy || milestones === undefined || !milestones.length}
                onClick={() => document.getElementById("newsfeed-milestone")?.focus()}
                className="size-12 rounded-2xl bg-background shadow-sm"
              >
                <Award aria-hidden="true" className="size-5 text-amber-500" />
              </Button>
            )}
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
            onChange={(event) => addFiles(event.target.files)}
          />
        </div>
        {!originalId && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="min-w-0 space-y-2.5">
              <label className="block space-y-2.5" htmlFor="newsfeed-post-tags">
                <ComposerSectionLabel>Tags</ComposerSectionLabel>
                <Input
                  id="newsfeed-post-tags"
                  value={tagText}
                  onChange={(event) => setTagText(event.target.value)}
                  disabled={busy}
                  placeholder="Figma, DesignSystems"
                  className="h-14 rounded-2xl border-transparent bg-muted/35 px-4 text-base font-medium"
                  aria-describedby="newsfeed-post-tags-help"
                />
                <span id="newsfeed-post-tags-help" className="block text-xs text-muted-foreground">
                  Add up to five tags, separated by commas or spaces.
                </span>
              </label>
              <SuggestedTagChips
                tags={postTags}
                selectedTags={selectedTags}
                disabled={busy}
                onToggle={toggleTag}
              />
            </div>
            <label className="block min-w-0 space-y-2.5" htmlFor="newsfeed-milestone">
              <ComposerSectionLabel>Attach a milestone (optional)</ComposerSectionLabel>
              <select
                id="newsfeed-milestone"
                value={milestoneId}
                onChange={(event) => {
                  setMilestoneId(event.target.value);
                  setMilestoneConfirmed(false);
                }}
                disabled={busy || milestones === undefined || !milestones.length}
                className="h-14 w-full rounded-2xl border border-transparent bg-muted/35 px-4 text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">
                  {milestones?.length === 0 ? "No milestone available" : "No milestone"}
                </option>
                {milestones?.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title} · {milestone.status}
                  </option>
                ))}
              </select>
              {milestones?.length === 0 && (
                <span className="block px-1 text-xs leading-relaxed text-muted-foreground">
                  No participant milestones are available to attach.
                </span>
              )}
            </label>
            {selectedMilestone && (
              <label className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-relaxed text-foreground md:col-span-2">
                <input
                  type="checkbox"
                  checked={milestoneConfirmed}
                  onChange={(event) => setMilestoneConfirmed(event.target.checked)}
                  disabled={busy}
                  className="mt-1 size-4 shrink-0 accent-primary"
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
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
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
      <footer className="flex shrink-0 flex-col gap-3 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Failed uploads can be retried. Your draft stays in this window until you publish.
        </p>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {busy && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => abort.current?.abort()}
              className="shrink-0"
            >
              Cancel upload
            </Button>
          )}
          <Button
            className="hr-v2-button-primary min-h-14 flex-1 rounded-full px-6 text-base font-semibold shadow-lg shadow-orange-500/10 disabled:opacity-50 sm:w-56 sm:flex-none"
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
        <section
          aria-label="Create a post"
          className="hr-card-surface hr-newsfeed-composer rounded-2xl p-4 sm:p-5"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void publish();
            }}
          >
            <div className="flex items-center gap-5 sm:items-start sm:gap-3">
              <Avatar className="size-14 shrink-0 border-2 border-orange-200 sm:size-11">
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
                placeholder="What's on your mind?"
                className="min-h-12 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-2 text-xl leading-7 shadow-none placeholder:text-slate-400 focus-visible:ring-0 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-slate-50 sm:px-4 sm:py-3 sm:text-sm sm:leading-5 dark:bg-transparent dark:sm:border-slate-700 dark:sm:bg-slate-900"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open post composer"
                title="Open full post composer"
                onClick={() => setOpen(true)}
                className="hidden shrink-0 text-slate-500 sm:inline-flex"
              >
                <Maximize2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="hr-newsfeed-quick-post-toolbar mt-4 ml-[4.875rem] flex flex-nowrap items-center justify-between gap-2 border-t border-slate-100 pt-4 sm:mt-3 sm:ml-0 sm:flex-wrap sm:gap-2 sm:pt-3 dark:border-slate-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Photo/Video"
                onClick={() => {
                  setOpen(true);
                  setTimeout(() => fileInput.current?.click(), 100);
                }}
                className="h-10 min-w-10 justify-center gap-1 px-2 sm:h-9 sm:min-w-0 sm:gap-2 sm:px-3 sm:text-sm"
              >
                <ImagePlus className="mr-0 size-5 text-slate-500 sm:mr-1.5 sm:size-4 sm:text-emerald-600" />
                <span className="hidden sm:inline">Photo/Video</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Add video"
                onClick={() => {
                  setOpen(true);
                  setTimeout(() => fileInput.current?.click(), 100);
                }}
                className="h-10 min-w-10 justify-center px-2 sm:hidden"
              >
                <Video aria-hidden="true" className="size-5 text-slate-500" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Add emoji"
                onClick={addEmoji}
                className="h-10 min-w-10 justify-center px-2 sm:hidden"
              >
                <Smile aria-hidden="true" className="size-5 text-slate-500" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(true);
                  setTimeout(() => document.getElementById("newsfeed-milestone")?.focus(), 100);
                }}
                className="hidden h-9 min-w-0 justify-center gap-1 px-2 text-xs sm:inline-flex sm:gap-2 sm:px-3 sm:text-sm"
              >
                <span
                  aria-hidden="true"
                  className="mr-0 text-[10px] text-orange-600 sm:mr-1.5 sm:text-base"
                >
                  ✺
                </span>{" "}
                <span className="truncate">Milestone</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(true);
                  setTimeout(() => document.getElementById("newsfeed-post-tags")?.focus(), 100);
                }}
                className="hidden h-9 min-w-0 justify-center gap-1 px-2 text-xs sm:inline-flex sm:gap-2 sm:px-3 sm:text-sm"
              >
                <Tags className="mr-0 size-3.5 text-blue-600 sm:mr-1.5 sm:size-4" />
                <span className="truncate">Tags</span>
              </Button>
              <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
                Public · Freelance Network
              </span>
              <Button
                type="submit"
                size="sm"
                aria-label={busy ? "Publishing" : error ? "Retry publishing" : "Publish"}
                disabled={busy || !body.trim() || Boolean(milestoneId && !milestoneConfirmed)}
                className="hr-v2-button-primary ml-0 h-14 w-[7.625rem] min-w-0 shrink-0 justify-center gap-1 rounded-full px-5 text-base font-semibold sm:ml-0 sm:h-9 sm:w-auto sm:gap-2 sm:px-4 sm:text-sm"
              >
                <span className="truncate sm:hidden">{busy ? "…" : error ? "Retry" : "Post"}</span>
                <span className="hidden truncate sm:inline">
                  {busy ? "Publishing…" : error ? "Retry" : "Publish"}
                </span>
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
        <DialogContent className="hr-newsfeed-dialog flex max-h-[min(94dvh,58rem)] max-w-[42rem] flex-col gap-0 overflow-hidden rounded-[1.75rem] border bg-background p-0">
          <MobileDialogClose />
          <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 text-left sm:px-8 sm:py-6 sm:pr-14">
            <DialogTitle className="text-[1.7rem] leading-tight tracking-tight sm:text-[2rem]">
              {originalId ? "Repost" : "Create Post"}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed sm:text-base">
              Share a milestone, deliverable, or update with your freelance network.
            </DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
    </>
  );
}
