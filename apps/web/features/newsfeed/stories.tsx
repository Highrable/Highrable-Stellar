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
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, ImagePlus, Plus, Trash2, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FunctionReturnType } from "convex/server";

import { MediaItem } from "./feed";
import { ImageEditor } from "./image-editor";
import { readMedia, uploadMedia } from "./media-client";
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

function StoryPreview({ media }: { media: Story["media"][number] | undefined }) {
  const client = useConvex();
  const container = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const preview = useQuery(
    api.newsfeed.queries.storyPreview,
    media && requested ? { mediaId: media._id } : "skip",
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    if (!media || !container.current) return;
    if (typeof IntersectionObserver === "undefined") {
      const timeout = window.setTimeout(() => setRequested(true), 0);
      return () => window.clearTimeout(timeout);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setRequested(true);
      },
      { rootMargin: "120px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [media?._id]);
  useEffect(() => {
    if (!requested || !media || preview !== null || url || !media.mime.startsWith("image/")) return;
    void readMedia(client, media._id, media.mime)
      .then((blob) => setUrl(URL.createObjectURL(blob)))
      .catch((reason) => setError(errorText(reason)));
  }, [client, media, preview, requested, url]);
  return (
    <div ref={container} className="absolute inset-0 bg-muted">
      {preview ? (
        <img src={preview} alt="" className="size-full object-cover" />
      ) : url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-sky-700 via-violet-700 to-rose-500 text-white">
          {media?.mime.startsWith("video/") ? (
            <Video aria-hidden="true" className="size-8" />
          ) : (
            <span className="text-3xl">H</span>
          )}
        </div>
      )}
      {error && (
        <span className="absolute inset-x-1 bottom-1 rounded bg-background/90 p-1 text-center text-[10px] text-destructive">
          Preview unavailable
        </span>
      )}
    </div>
  );
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
      className={`inline-flex shrink-0 rounded-full bg-gradient-to-tr from-yellow-300 via-orange-500 to-amber-400 p-[3px] ${className}`}
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
  const [files, setFiles] = useState<FileDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingImageKey, setEditingImageKey] = useState<string | null>(null);
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
      });
      const activeStoryId = storyId.current;
      if (!activeStoryId) throw new Error("Could not start your story draft.");
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
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a story</DialogTitle>
          <DialogDescription>Share photos or videos for 24 hours.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-4 text-emerald-600" /> Add photos or videos
            </Button>
            <Input
              ref={fileInput}
              className="sr-only"
              type="file"
              aria-label="Choose story photos or videos"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
              disabled={busy}
              onChange={(event) => {
                const added = Array.from(event.target.files ?? []).map((file) => {
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
                event.target.value = "";
              }}
            />
          </div>
          {files.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {files.map((file) => (
                <li key={file.key} className="rounded-xl border p-2">
                  {file.file.type.startsWith("image/") ? (
                    <img
                      src={file.preview}
                      alt={file.file.name}
                      className="h-28 w-full rounded object-cover"
                    />
                  ) : (
                    <video
                      src={file.preview}
                      controls
                      preload="metadata"
                      className="h-28 w-full object-contain"
                    >
                      <track kind="captions" />
                    </video>
                  )}
                  <p className="mt-1 truncate text-xs">{file.file.name}</p>
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
                    className="mt-1 w-full"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void remove(file)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
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
          <div className="flex justify-end gap-2">
            {busy && (
              <Button type="button" variant="ghost" onClick={() => abort.current?.abort()}>
                Cancel upload
              </Button>
            )}
            <Button
              type="button"
              disabled={busy || files.length === 0}
              onClick={() => void publish()}
            >
              {busy ? "Publishing…" : error ? "Retry publishing" : "Share story"}
            </Button>
          </div>
        </div>
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
      <DialogContent className="h-dvh w-screen max-w-none overflow-hidden rounded-none border-0 bg-black p-0 sm:h-[min(94dvh,900px)] sm:w-[min(450px,calc(100vw-2rem))] sm:rounded-2xl">
        <div className="relative flex h-full flex-col overflow-hidden bg-black text-white">
          <DialogHeader className="shrink-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pr-14 pb-3 text-left">
            <div
              role="group"
              aria-label={`Story ${initial.story + 1} of ${group.stories.length}`}
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
                <DialogDescription className="text-white/70">
                  {new Date(activeStory.publishedAt ?? 0).toLocaleString()}
                </DialogDescription>
              </div>
              {viewer?._id === group.author.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete story"
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
                {status === "LoadingFirstPage" ? "Loading story…" : "No story media available."}
              </p>
            )}
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Previous story item"
              disabled={status === "LoadingFirstPage"}
              className="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60"
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Next story item"
              disabled={status === "LoadingFirstPage"}
              className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60"
              onClick={() => move(1)}
            >
              <ChevronRight />
            </Button>
          </main>
          <footer className="z-10 shrink-0 border-t border-white/10 bg-black px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-white/80">
              <span>{activeStory.reactionCount} reactions</span>
              <div className="flex gap-1" aria-label="Story reaction counts">
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
              <div role="group" aria-label="React to story" className="flex justify-between gap-1">
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
      <section aria-label="Stories" className="hr-card-surface p-4">
        <p role="status" className="text-sm text-muted-foreground">
          Loading stories…
        </p>
      </section>
    );
  const selectedStory = selection ? groups[selection.group]?.stories[selection.story] : null;
  return (
    <>
      <section aria-label="Stories" className="hr-card-surface rounded-2xl p-4">
        <header className="mb-3">
          <h2 className="font-semibold">Stories</h2>
          <p className="text-xs text-muted-foreground">Photos and videos stay up for 24 hours.</p>
        </header>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {viewer && (
            <button
              type="button"
              className="relative h-48 w-32 shrink-0 overflow-hidden rounded-xl border bg-muted text-left shadow-sm"
              onClick={() => setCreating(true)}
              aria-label="Create a story"
            >
              <div className="absolute inset-0">
                {viewer.avatarUrl ? (
                  <img
                    src={viewer.avatarUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-700 via-orange-600 to-amber-400">
                    <Avatar className="size-20 border-4 border-white/90">
                      <AvatarImage src={undefined} alt="" />
                      <AvatarFallback className="text-3xl">
                        {viewer.name?.slice(0, 1) ?? "H"}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
                <span className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/10 to-black/80" />
              </div>
              <span className="absolute top-[7.25rem] left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-orange-600 text-white shadow-md">
                <Plus className="size-5" />
              </span>
              <span className="absolute inset-x-1 bottom-3 text-center text-sm font-semibold text-white drop-shadow">
                Create story
              </span>
            </button>
          )}
          {groups.map((group, groupIndex) => {
            const first = group.stories[0];
            return (
              <button
                key={group.author.id}
                type="button"
                className="relative h-48 w-32 shrink-0 overflow-hidden rounded-xl border bg-muted text-left text-white shadow-sm"
                onClick={() => setSelection({ group: groupIndex, story: 0 })}
                aria-label={`View ${group.author.name}'s stories`}
              >
                <StoryPreview media={first?.media[0]} />
                <span className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
                <StoryAvatar
                  src={group.author.avatarUrl}
                  name={group.author.name}
                  className="absolute top-3 left-3 size-11"
                />
                <span className="absolute inset-x-2 bottom-3 line-clamp-2 text-left text-sm leading-5 font-semibold">
                  {group.author.name}
                </span>
              </button>
            );
          })}
          {groups.length === 0 && !viewer && (
            <p className="py-4 text-sm text-muted-foreground">No active stories yet.</p>
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
