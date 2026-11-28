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
import { ChevronDown, ImagePlus, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  ComposerMediaList,
  ComposerSectionLabel,
  MobileDialogClose,
  SuggestedTagChips,
} from "./composer-ui";
import { ImageEditor } from "./image-editor";
import { uploadMedia } from "./media-client";
import { createNewsfeedRequestId } from "./request-id";
import { useSocialSession } from "./session";

const MEDIA_TYPES = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm";

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
  const request = useRef<string | null>(null);
  const postId = useRef<TConvexId<"socialPosts"> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const textUpload = useRef<{ text: string; key: string; id?: TConvexId<"socialMedia"> } | null>(
    null,
  );
  const previews = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  const quickFileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const urls = previews.current;
    return () => {
      abort.current?.abort();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);
  if (!token || !viewer) return null;
  const canPublish =
    Boolean(body.trim() || files.length || originalId) && (!milestoneId || milestoneConfirmed);

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
  function addFiles(input: HTMLInputElement) {
    const selectedFiles = Array.from(input.files ?? []);
    input.value = "";
    if (!selectedFiles.length) return;

    const added = selectedFiles.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { key: createNewsfeedRequestId(), file, preview, progress: 0 };
    });
    setFiles((current) => [...current, ...added]);
    setOpen(true);
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
    if (busy || !canPublish) return;
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      postId.current ??= await client.mutation(api.newsfeed.mutations.beginPost, {
        token,
        requestId: (request.current ??= createNewsfeedRequestId()),
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
        textUpload.current ??= { text: body, key: createNewsfeedRequestId() };
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
      request.current = null;
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
  const postTags =
    tagSuggestions
      ?.flatMap(({ tag }) => (typeof tag === "string" && tag ? [tag] : []))
      .slice(0, 5) ?? [];
  const form = (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        <label className="block space-y-2.5" htmlFor="newsfeed-post-text">
          <ComposerSectionLabel>
            {originalId ? "Add your perspective" : "Share an update"}
          </ComposerSectionLabel>
          <Textarea
            id="newsfeed-post-text"
            className="min-h-28 resize-y rounded-xl bg-muted/20 px-3 py-3 text-base leading-6 sm:min-h-36"
            value={body}
            disabled={busy}
            onChange={(event) => setBody(event.target.value)}
            placeholder={originalId ? "What do you think about this?" : "What are you working on?"}
          />
        </label>
        <ComposerMediaList
          label="Post uploads"
          files={files}
          busy={busy}
          onEdit={setEditingImageKey}
          onRemove={(file) => void remove(file)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="min-h-11 rounded-xl"
        >
          <ImagePlus aria-hidden="true" className="size-4 text-primary" />
          {files.length ? "Add more photos or videos" : "Add photos or videos"}
        </Button>
        <input
          ref={fileInput}
          aria-label="Choose post photos or videos"
          hidden
          type="file"
          multiple
          accept={MEDIA_TYPES}
          disabled={busy}
          onChange={(event) => addFiles(event.currentTarget)}
        />
        {!originalId && (
          <details className="group rounded-xl border px-3 sm:px-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown
                aria-hidden="true"
                className="size-4 text-muted-foreground group-open:rotate-180"
              />
              Tags and milestone
              {selectedTags.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {selectedTags.length} {selectedTags.length === 1 ? "tag" : "tags"}
                </span>
              )}
              {milestoneId && (
                <span className="text-xs font-normal text-muted-foreground">
                  {milestoneConfirmed ? "Milestone attached" : "Confirm milestone"}
                </span>
              )}
            </summary>
            <div className="grid gap-4 border-t py-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2.5">
                <label className="block space-y-2.5" htmlFor="newsfeed-post-tags">
                  <ComposerSectionLabel>Tags</ComposerSectionLabel>
                  <Input
                    id="newsfeed-post-tags"
                    value={tagText}
                    onChange={(event) => setTagText(event.target.value)}
                    disabled={busy}
                    placeholder="Figma, DesignSystems"
                    className="h-11 rounded-xl text-base"
                    aria-describedby="newsfeed-post-tags-help"
                  />
                  <span
                    id="newsfeed-post-tags-help"
                    className="block text-xs text-muted-foreground"
                  >
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
                  className="h-11 w-full rounded-xl border bg-background px-3 text-base focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
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
              </label>
              {selectedMilestone && (
                <label className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-relaxed text-foreground sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={milestoneConfirmed}
                    onChange={(event) => setMilestoneConfirmed(event.target.checked)}
                    disabled={busy}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <span>
                    I confirm this public post may show “{selectedMilestone.title}” and its current
                    status (“{selectedMilestone.status}”). Amounts, files, and agreement details
                    will stay private.
                  </span>
                </label>
              )}
            </div>
          </details>
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
      <footer className="shrink-0 space-y-2 border-t px-4 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {milestoneId && !milestoneConfirmed && (
          <p className="text-sm text-muted-foreground">Confirm your milestone before publishing.</p>
        )}
        <div className="flex items-center justify-end gap-2">
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
            className="hr-v2-button-primary min-h-11 flex-1 rounded-xl px-5 sm:flex-none"
            type="button"
            disabled={busy || !canPublish}
            onClick={() => void publish()}
          >
            {busy
              ? "Publishing…"
              : error
                ? "Retry publishing"
                : originalId
                  ? "Repost"
                  : "Publish post"}
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
              if (files.length) {
                setOpen(true);
                return;
              }
              void publish();
            }}
          >
            <div className="flex items-start gap-3">
              <Avatar className="size-10 shrink-0 border-2 border-orange-200">
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
                className="min-h-11 flex-1 resize-none rounded-xl bg-muted/20 px-3 py-2.5 text-base"
              />
            </div>
            <input
              ref={quickFileInput}
              aria-label="Choose quick post photos or videos"
              hidden
              type="file"
              multiple
              accept={MEDIA_TYPES}
              disabled={busy}
              onChange={(event) => addFiles(event.currentTarget)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => quickFileInput.current?.click()}
                className="min-h-11 gap-1.5 rounded-xl px-2 sm:px-3"
              >
                <ImagePlus aria-hidden="true" className="size-4 text-primary" />
                Add media
              </Button>
              {files.length === 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setOpen(true)}
                  className="min-h-11 gap-1.5 rounded-xl px-2 sm:px-3"
                >
                  <SlidersHorizontal aria-hidden="true" className="size-4 text-muted-foreground" />
                  Post options
                </Button>
              )}
              <Button
                type="submit"
                disabled={busy || (!files.length && !canPublish)}
                className="hr-v2-button-primary ml-auto min-h-11 rounded-xl px-4"
              >
                {busy
                  ? "Publishing…"
                  : files.length
                    ? "Review draft"
                    : error
                      ? "Retry publishing"
                      : "Publish"}
              </Button>
            </div>
          </form>
          {error && !open && (
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
        <DialogContent className="hr-newsfeed-dialog flex max-h-[min(90dvh,44rem)] flex-col gap-0 overflow-hidden rounded-t-2xl border bg-background p-0 data-[vaul-drawer-direction=bottom]:max-h-[95dvh] md:rounded-2xl">
          <MobileDialogClose />
          <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 sm:px-6 sm:pr-14">
            <DialogTitle className="text-xl leading-tight">
              {originalId ? "Repost" : "Create a post"}
            </DialogTitle>
            <DialogDescription className="text-sm">Public · Freelance Network</DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
    </>
  );
}
