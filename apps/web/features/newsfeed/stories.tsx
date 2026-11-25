"use client";
import { PageLoadingState } from "@/features/common/components/layout/page-loading-state";
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
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Clock3, Globe2, ImagePlus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import type { FunctionReturnType } from "convex/server";

import { ComposerSectionLabel, MobileDialogClose, SuggestedTagChips } from "./composer-ui";
import { MediaItem } from "./feed";
import { ImageEditor } from "./image-editor";
import { uploadMedia } from "./media-client";
import { useSocialSession } from "./session";

type Groups = NonNullable<FunctionReturnType<typeof api.newsfeed.queries.activeStories>>;
type Story = Groups[number]["stories"][number];
type FileDraft = {
  key: string;
  file: File;
  preview: string;
  poster: Promise<string | undefined>;
  progress: number;
  id?: TConvexId<"socialMedia">;
};
const kinds = ["Like", "Celebrate", "Support", "Love", "Insightful", "Funny"] as const;
const emoji: Record<(typeof kinds)[number], string> = {
  Like: "👍",
  Celebrate: "🎉",
  Support: "🙌",
  Love: "❤️",
  Insightful: "💡",
  Funny: "😂",
};
const errorText = (error: unknown) => (error instanceof Error ? error.message : "Please retry.");
function relativeStoryTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function createStoryPoster(file: File): Promise<string | undefined> {
  const sourceUrl = URL.createObjectURL(file);
  let video: HTMLVideoElement | null = null;
  try {
    let frame: HTMLImageElement | HTMLVideoElement;
    if (file.type.startsWith("image/")) {
      const image = new Image();
      image.src = sourceUrl;
      await image.decode();
      frame = image;
    } else {
      video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.playsInline = true;
      video.src = sourceUrl;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Could not preview video.")),
          8000,
        );
        video!.addEventListener(
          "loadeddata",
          () => {
            window.clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
        video!.addEventListener(
          "error",
          () => {
            window.clearTimeout(timeout);
            reject(new Error("Could not preview video."));
          },
          { once: true },
        );
      });
      frame = video;
    }
    const width = frame instanceof HTMLVideoElement ? frame.videoWidth : frame.naturalWidth;
    const height = frame instanceof HTMLVideoElement ? frame.videoHeight : frame.naturalHeight;
    if (!width || !height) return undefined;
    const scale = Math.min(1, 360 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    const poster = canvas.toDataURL("image/jpeg", 0.62);
    return poster.length <= 250_000 ? poster : undefined;
  } catch {
    return undefined;
  } finally {
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    URL.revokeObjectURL(sourceUrl);
  }
}

function StoryAvatar({
  src,
  name,
  className = "size-11",
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full bg-linear-to-tr from-yellow-300 via-orange-500 to-amber-400 p-0.75 ${className}`}
    >
      <Avatar className="size-full border-2 border-background">
        <AvatarImage src={src ?? undefined} alt="" />
        <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
      </Avatar>
    </span>
  );
}

function StoryComposer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { token, viewer } = useSocialSession();
  const client = useConvex();
  const suggestedTags = useQuery(api.newsfeed.queries.trendingTags, {});
  const [files, setFiles] = useState<FileDraft[]>([]);
  const [note, setNote] = useState("");
  const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [editingImageKey, setEditingImageKey] = useState<string | null>(null);
  const selectedTags = tagText
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, ""))
    .filter(Boolean);

  function toggleSuggestedTag(tag: string) {
    const next = selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase())
      ? selectedTags.filter((item) => item.toLowerCase() !== tag.toLowerCase())
      : [...selectedTags, tag].slice(0, 5);
    setTagText(next.join(", "));
  }
  const requestId = useRef(crypto.randomUUID());
  const storyId = useRef<TConvexId<"socialStories"> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const previews = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );
  async function remove(file: FileDraft) {
    try {
      if (storyId.current && token) {
        const media =
          file.id ??
          (await client.query(api.newsfeed.queries.uploadByRequest, { token, requestId: file.key }))
            ?._id;
        if (media) await client.mutation(api.newsfeed.media.remove, { token, mediaId: media });
      }
      URL.revokeObjectURL(file.preview);
      previews.current.delete(file.preview);
      setFiles((current) => current.filter((item) => item.key !== file.key));
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  function addFiles(list: FileList | null) {
    const added = Array.from(list ?? []).map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return {
        key: crypto.randomUUID(),
        file,
        preview,
        poster: createStoryPoster(file),
        progress: 0,
      };
    });
    setFiles((current) => [...current, ...added]);
    if (fileInput.current) fileInput.current.value = "";
  }
  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!busy) setDragActive(true);
  }
  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  }
  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    if (!busy) addFiles(event.dataTransfer.files);
  }
  function applyImageEdits(key: string, edited: File) {
    setFiles((current) =>
      current.map((file) => {
        if (file.key !== key) return file;
        URL.revokeObjectURL(file.preview);
        previews.current.delete(file.preview);
        const preview = URL.createObjectURL(edited);
        previews.current.add(preview);
        return { ...file, file: edited, preview, poster: createStoryPoster(edited), progress: 0 };
      }),
    );
  }
  async function publish() {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      storyId.current ??= await client.mutation(api.newsfeed.mutations.beginStory, {
        token,
        requestId: requestId.current,
        note,
        tags: tagText
          .split(/[\s,]+/)
          .map((tag) => tag.trim().replace(/^#/, ""))
          .filter(Boolean),
      });
      const activeStoryId = storyId.current;
      if (!activeStoryId) throw new Error("Could not start your showcase draft.");
      for (const file of files) {
        if (file.id) continue;
        const poster = file.key === files[0]?.key ? await file.poster : undefined;
        const mediaId = await uploadMedia(client, {
          token,
          storyId: activeStoryId,
          requestId: file.key,
          file: file.file,
          ...(poster ? { preview: poster } : {}),
          signal: abort.current.signal,
          onProgress: (progress) =>
            setFiles((items) =>
              items.map((item) => (item.key === file.key ? { ...item, progress } : item)),
            ),
        });
        setFiles((items) =>
          items.map((item) => (item.key === file.key ? { ...item, id: mediaId } : item)),
        );
      }
      await client.mutation(api.newsfeed.mutations.publishStory, {
        token,
        storyId: activeStoryId,
      });
      for (const file of files) URL.revokeObjectURL(file.preview);
      previews.current.clear();
      setFiles([]);
      setNote("");
      setTagText("");
      storyId.current = null;
      requestId.current = crypto.randomUUID();
      onOpenChange(false);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  if (!viewer) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hr-newsfeed-dialog flex max-h-[min(94dvh,52rem)] max-w-168 flex-col gap-0 overflow-hidden rounded-[1.75rem] border bg-background p-0">
        <MobileDialogClose />
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 text-left sm:px-8 sm:py-6 sm:pr-14">
          <div className="flex flex-wrap items-center gap-2.5">
            <DialogTitle className="text-[1.65rem] leading-tight tracking-tight sm:text-[2rem]">
              Create a showcase
            </DialogTitle>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700 dark:bg-orange-950/40 dark:text-orange-200">
              WIP
            </span>
          </div>
          <DialogDescription className="max-w-[38rem] text-sm leading-relaxed sm:text-base">
            Share raw snapshots, design artifacts, or quick work in progress for 24 hours.
          </DialogDescription>
        </DialogHeader>
        <div className="mx-5 mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-[0.7rem] font-bold text-muted-foreground sm:mx-8 sm:px-5">
          <span className="inline-flex items-center gap-2">
            <Clock3 aria-hidden="true" className="size-4 text-orange-600" /> Auto-expires in 24
            hours
          </span>
          <span className="inline-flex items-center gap-2">
            <Globe2 aria-hidden="true" className="size-4 text-emerald-600" /> Visible to Network
            &amp; Clients
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6">
          <section aria-labelledby="newsfeed-showcase-upload-label" className="space-y-2.5">
            <h3 id="newsfeed-showcase-upload-label">
              <ComposerSectionLabel>Upload artifacts</ComposerSectionLabel>
            </h3>
            <button
              type="button"
              aria-label="Add photos or videos to your showcase"
              aria-describedby="newsfeed-showcase-upload-help"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              onDragEnter={handleDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex min-h-48 w-full flex-col items-center justify-center rounded-[1.5rem] border-2 border-dashed px-5 py-7 text-center transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-52 ${
                dragActive
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/40"
              }`}
            >
              <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-background text-orange-600 shadow-sm ring-1 ring-border/70">
                <ImagePlus aria-hidden="true" className="size-7" />
              </span>
              <span className="text-base font-bold text-foreground">Add photos or videos</span>
              <span
                id="newsfeed-showcase-upload-help"
                className="mt-1 text-sm text-muted-foreground"
              >
                Drag and drop or click to browse
              </span>
            </button>
            <Input
              ref={fileInput}
              className="sr-only"
              type="file"
              aria-label="Choose showcase photos or videos"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
              disabled={busy}
              onChange={(event) => addFiles(event.target.files)}
            />
          </section>
          {files.length > 0 && (
            <ul aria-label="Showcase uploads" className="grid gap-3 sm:grid-cols-2">
              {files.map((file) => (
                <li
                  key={file.key}
                  className="min-w-0 rounded-2xl border border-border/70 bg-muted/20 p-3"
                >
                  {file.file.type.startsWith("image/") ? (
                    <img
                      src={file.preview}
                      alt={file.file.name}
                      className="h-36 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <video
                      src={file.preview}
                      controls
                      preload="metadata"
                      className="h-36 w-full rounded-xl bg-black object-contain"
                    >
                      <track kind="captions" />
                    </video>
                  )}
                  <p className="mt-2 truncate text-sm font-semibold" title={file.file.name}>
                    {file.file.name}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {(file.file.size / (1024 * 1024)).toFixed(1)} MB · {file.file.type || "Media"}
                  </p>
                  <progress
                    aria-label={`Uploading ${file.file.name}`}
                    max={100}
                    value={file.progress}
                    className="mt-3 w-full accent-primary"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {file.file.type.startsWith("image/") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || Boolean(file.id)}
                        onClick={() => setEditingImageKey(file.key)}
                        className="rounded-full"
                      >
                        Edit image
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void remove(file)}
                      className="rounded-full text-muted-foreground"
                    >
                      <Trash2 aria-hidden="true" className="mr-1.5 size-3.5" /> Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <label htmlFor="newsfeed-spark-note" className="block space-y-2.5">
            <ComposerSectionLabel>Add context or a deliverable note</ComposerSectionLabel>
            <Textarea
              id="newsfeed-spark-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={busy}
              maxLength={500}
              className="min-h-36 resize-y rounded-[1.5rem] border-transparent bg-muted/35 px-5 py-4 text-base leading-6 placeholder:text-muted-foreground/80 focus-visible:border-primary/30"
              placeholder="What are you tweaking? For example, iterating on a checkout metrics dashboard before client sign-off…"
            />
          </label>
          <label htmlFor="newsfeed-spark-tags" className="block space-y-2.5">
            <ComposerSectionLabel>Suggested craft tags</ComposerSectionLabel>
            <Input
              id="newsfeed-spark-tags"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              disabled={busy}
              placeholder="WIP, Figma, Dashboard"
              className="h-14 rounded-2xl border-transparent bg-muted/35 px-4 text-base font-medium"
              aria-describedby="newsfeed-spark-tags-help"
            />
            <span id="newsfeed-spark-tags-help" className="block text-xs text-muted-foreground">
              Add up to five tags, separated by commas or spaces.
            </span>
          </label>
          <SuggestedTagChips
            tags={
              suggestedTags
                ?.flatMap(({ tag }) => (typeof tag === "string" && tag ? [tag] : []))
                .slice(0, 5) ?? []
            }
            selectedTags={selectedTags}
            disabled={busy}
            onToggle={toggleSuggestedTag}
          />
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
        <footer className="flex shrink-0 flex-col gap-3 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-xs text-muted-foreground">Showcases stay visible for 24 hours.</p>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {busy && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => abort.current?.abort()}
                className="shrink-0"
              >
                Cancel upload
              </Button>
            )}
            <Button
              type="button"
              disabled={busy || files.length === 0}
              onClick={() => void publish()}
              className="hr-v2-button-primary min-h-14 flex-1 rounded-full px-6 text-base font-semibold shadow-lg shadow-orange-500/10 sm:w-56 sm:flex-none"
            >
              {busy ? "Publishing…" : error ? "Retry publishing" : "Share showcase"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function StoryViewer({
  groups,
  initial,
  onClose,
  onNavigate,
}: {
  groups: Groups;
  initial: { group: number; story: number };
  onClose: () => void;
  onNavigate: (group: number, story: number) => void;
}) {
  const { token, viewer } = useSocialSession();
  const group = groups[initial.group]!;
  const story = group.stories[initial.story]!;
  const [mediaIndex, setMediaIndex] = useState(0);
  const [progressState, setProgressState] = useState({ mediaId: "", percent: 0 });
  const [reactionState, setReactionState] = useState({
    server: story.viewerReaction,
    confirmed: story.viewerReaction,
    selected: story.viewerReaction,
  });
  const stateMatchesServer = reactionState.server === story.viewerReaction;
  const confirmedReaction = stateMatchesServer ? reactionState.confirmed : story.viewerReaction;
  const selectedReaction = stateMatchesServer ? reactionState.selected : story.viewerReaction;
  const [reactionBusy, setReactionBusy] = useState(false);
  const [error, setError] = useState("");
  const { results, status, loadMore } = usePaginatedQuery(
    api.newsfeed.queries.storyMedia,
    { storyId: story._id },
    { initialNumItems: 20 },
  );
  const react = useMutation(api.newsfeed.mutations.reactToStory);
  const remove = useMutation(api.newsfeed.mutations.deleteStory);
  const activeStory = story;
  const media = results[mediaIndex];
  const flat = useMemo(
    () =>
      groups.flatMap((item, groupIndex) =>
        item.stories.map((entry, storyIndex) => ({ groupIndex, storyIndex, entry })),
      ),
    [groups],
  );
  const flatIndex = flat.findIndex((item) => item.entry._id === activeStory._id);
  const progressPercent = progressState.mediaId === media?._id ? progressState.percent : 0;
  const move = useCallback(
    (direction: -1 | 1) => {
      if (direction > 0 && mediaIndex < results.length - 1) {
        setMediaIndex((index) => index + 1);
        return;
      }
      if (direction < 0 && mediaIndex > 0) {
        setMediaIndex((index) => index - 1);
        return;
      }
      if (direction > 0 && status === "CanLoadMore") {
        loadMore(20);
        return;
      }
      if (direction > 0 && status === "LoadingMore") return;
      const next = flat[flatIndex + direction];
      if (!next) {
        onClose();
        return;
      }
      onNavigate(next.groupIndex, next.storyIndex);
    },
    [flat, flatIndex, loadMore, mediaIndex, onClose, onNavigate, results.length, status],
  );
  useEffect(() => {
    if (!media || !media.mime.startsWith("image/")) return;
    const frame = window.requestAnimationFrame(() =>
      setProgressState({ mediaId: media._id, percent: 100 }),
    );
    const timeout = window.setTimeout(() => move(1), 5000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [media?._id, media?.mime, move]);
  async function reactTo(kind: Story["viewerReaction"]) {
    if (!token || reactionBusy) return;
    setError("");
    setReactionBusy(true);
    setReactionState({
      server: activeStory.viewerReaction,
      confirmed: confirmedReaction,
      selected: kind,
    });
    try {
      await react({ token, storyId: activeStory._id, kind });
      setReactionState({
        server: activeStory.viewerReaction,
        confirmed: kind,
        selected: kind,
      });
    } catch (reason) {
      setReactionState({
        server: activeStory.viewerReaction,
        confirmed: confirmedReaction,
        selected: confirmedReaction,
      });
      setError(errorText(reason));
    } finally {
      setReactionBusy(false);
    }
  }
  async function deleteOwnStory() {
    if (!token) return;
    try {
      await remove({ token, storyId: activeStory._id });
      onClose();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="h-dvh w-screen max-w-none overflow-hidden rounded-none border-0 bg-black p-0 sm:h-[min(94dvh,68rem)] sm:w-[min(36rem,calc(100vw-2rem))] sm:rounded-2xl">
        <div className="relative flex h-full flex-col overflow-hidden bg-black text-white">
          <DialogHeader className="shrink-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14 pb-3 text-left">
            <div
              role="group"
              aria-label={`Showcase item ${initial.story + 1} of ${group.stories.length}`}
              className="mb-4 flex gap-1"
            >
              {group.stories.map((entry, index) => (
                <span
                  key={entry._id}
                  aria-hidden="true"
                  className="h-1 flex-1 rounded-full bg-white/30"
                >
                  {index < initial.story && <span className="block h-full rounded-full bg-white" />}
                  {index === initial.story && (
                    <span
                      className="block h-full rounded-full bg-white transition-[width] ease-linear"
                      style={{
                        width: `${progressPercent}%`,
                        transitionDuration: media?.mime.startsWith("video/") ? "150ms" : "5000ms",
                      }}
                    />
                  )}
                </span>
              ))}
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <StoryAvatar
                src={group.author.avatarUrl}
                name={group.author.name}
                className="size-11"
              />
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-white">{group.author.name}</DialogTitle>
                <DialogDescription className="flex min-w-0 items-center gap-1.5 truncate text-white/70">
                  <time
                    dateTime={
                      activeStory.publishedAt
                        ? new Date(activeStory.publishedAt).toISOString()
                        : undefined
                    }
                  >
                    {activeStory.publishedAt
                      ? relativeStoryTime(activeStory.publishedAt)
                      : "Just now"}
                  </time>
                  {!!activeStory.tags?.[0] && (
                    <>
                      <span aria-hidden="true">·</span>
                      <Link
                        href={`/newsfeed/search?tag=${encodeURIComponent(activeStory.tags[0])}`}
                        className="truncate text-orange-300 hover:text-orange-200"
                      >
                        #{activeStory.tags[0]}
                      </Link>
                    </>
                  )}
                </DialogDescription>
              </div>
              {viewer?._id === group.author.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete showcase"
                  onClick={() => void deleteOwnStory()}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </DialogHeader>
          <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
            {media ? (
              <MediaItem
                key={media._id}
                media={media}
                auto
                autoPlayVideo
                storyMode
                onVideoEnded={() => move(1)}
                onVideoProgress={(percent) => setProgressState({ mediaId: media._id, percent })}
              />
            ) : (
              <p role="status" className="p-4 text-center text-sm text-white/70">
                {status === "LoadingFirstPage"
                  ? "Loading showcase…"
                  : "No showcase media available."}
              </p>
            )}
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Previous showcase item"
              disabled={status === "LoadingFirstPage"}
              className="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60"
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Next showcase item"
              disabled={status === "LoadingFirstPage"}
              className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60"
              onClick={() => move(1)}
            >
              <ChevronRight />
            </Button>
          </main>
          <footer className="z-10 shrink-0 border-t border-white/10 bg-black px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {activeStory.note && <p className="mb-2 text-sm text-white/90">{activeStory.note}</p>}
            {!!activeStory.tags?.length && (
              <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Showcase tags">
                {activeStory.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/newsfeed/search?tag=${encodeURIComponent(tag)}`}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-orange-200"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/80">
              <span>{activeStory.reactionCount} reactions</span>
              <div className="flex gap-1" aria-label="Showcase reaction counts">
                {kinds.map(
                  (kind) =>
                    activeStory.reactionCounts[kind] > 0 && (
                      <span key={kind}>
                        {emoji[kind]} {activeStory.reactionCounts[kind]}
                      </span>
                    ),
                )}
              </div>
            </div>
            {viewer && (
              <div
                role="group"
                aria-label="React to showcase"
                className="flex justify-between gap-1"
              >
                {kinds.map((kind) => (
                  <Button
                    key={kind}
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={reactionBusy}
                    aria-label={`React ${kind}`}
                    aria-pressed={selectedReaction === kind}
                    className="text-lg"
                    onClick={() => void reactTo(kind)}
                  >
                    {emoji[kind]}
                  </Button>
                ))}
                {selectedReaction && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={reactionBusy}
                    onClick={() => void reactTo(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-300">
                {error}
              </p>
            )}
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SparkPermalink({ sparkId }: { sparkId: string }) {
  const router = useRouter();
  const { token } = useSocialSession();
  const groups = useQuery(api.newsfeed.queries.storyById, {
    storyId: sparkId as TConvexId<"socialStories">,
    ...(token ? { token } : {}),
  });
  if (groups === undefined) return <PageLoadingState label="showcase" />;
  if (!groups?.length) return <p>This showcase is unavailable or has expired.</p>;
  return (
    <StoryViewer
      key={sparkId}
      groups={groups as Groups}
      initial={{ group: 0, story: 0 }}
      onClose={() => router.push("/newsfeed")}
      onNavigate={() => router.push("/newsfeed")}
    />
  );
}

export function Stories() {
  const { token, viewer } = useSocialSession();
  const groups = useQuery(api.newsfeed.queries.activeStories, token ? { token } : {});
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState<{ group: number; story: number } | null>(null);
  const closeViewer = useCallback(() => setSelection(null), []);
  const navigateViewer = useCallback(
    (group: number, story: number) => setSelection({ group, story }),
    [],
  );
  if (groups === undefined)
    return (
      <section
        aria-label="Showcase"
        className="hr-card-surface hr-newsfeed-showcase rounded-2xl p-0 sm:p-4"
      >
        <p role="status" className="text-sm text-muted-foreground">
          Loading showcase…
        </p>
      </section>
    );
  const selectedStory = selection ? groups[selection.group]?.stories[selection.story] : null;
  return (
    <>
      <section
        aria-label="Showcase"
        className="hr-card-surface hr-newsfeed-showcase rounded-2xl p-0 sm:px-5 sm:py-4"
      >
        <header className="mb-3 hidden items-center justify-between gap-3 sm:flex">
          <h2 className="text-sm font-semibold">Showcase</h2>
          <p className="text-xs text-muted-foreground">Photos and videos · 24 hours</p>
        </header>
        <div className="hr-newsfeed-showcase-list flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
          {viewer && (
            <button
              type="button"
              className="hr-newsfeed-story-card group flex w-22 shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl border border-slate-100 bg-card p-2 text-center sm:w-20 sm:rounded-xl sm:border-0 sm:bg-transparent sm:p-1 dark:border-slate-800"
              onClick={() => setCreating(true)}
              aria-label="Create a showcase"
            >
              <span className="flex size-18 items-center justify-center rounded-full border-2 border-dashed border-orange-500 bg-background transition-colors group-hover:bg-orange-50 sm:size-16 dark:group-hover:bg-orange-950/30">
                <span className="flex size-8 items-center justify-center text-orange-600 dark:text-orange-300">
                  <Plus className="size-6" />
                </span>
              </span>
              <span className="w-full truncate text-xs font-medium text-foreground">
                <span className="sm:hidden">Add Story</span>
                <span className="hidden sm:inline">Add showcase</span>
              </span>
            </button>
          )}
          {groups.map((group, groupIndex) => (
            <button
              key={group.author.id}
              type="button"
              className="hr-newsfeed-story-card group flex w-22 shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl border border-slate-100 bg-card p-2 text-center sm:w-20 sm:rounded-xl sm:border-0 sm:bg-transparent sm:p-1 dark:border-slate-800"
              onClick={() => setSelection({ group: groupIndex, story: 0 })}
              aria-label={`View ${group.author.name}'s showcase`}
            >
              <StoryAvatar
                src={group.author.avatarUrl}
                name={group.author.name}
                className="size-18 transition-transform group-hover:scale-[1.03] sm:size-16"
              />
              <span className="w-full truncate text-xs font-medium text-foreground">
                {group.author.name}
              </span>
            </button>
          ))}
          {groups.length === 0 && !viewer && (
            <p className="py-4 text-sm text-muted-foreground">No active showcases yet.</p>
          )}
        </div>
      </section>
      <StoryComposer open={creating} onOpenChange={setCreating} />
      {selectedStory && selection && (
        <StoryViewer
          key={selectedStory._id}
          groups={groups}
          initial={selection}
          onClose={closeViewer}
          onNavigate={navigateViewer}
        />
      )}
    </>
  );
}
