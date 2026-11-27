"use client";
import { api, type TConvexId } from "@repo/convex-client";
import { TagChip } from "@repo/ui/components/highrable/social-primitives";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/ui/popover";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import { Copy, MessageCircle, MoreHorizontal, Repeat2, Share2, ThumbsUp } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { FunctionReturnType } from "convex/server";
import type { FormEvent, ReactNode } from "react";

import { readMedia, uploadMedia } from "./media-client";
import { useSocialSession } from "./session";

const Composer = dynamic(() => import("./composer").then((module) => module.Composer));
type Post = NonNullable<FunctionReturnType<typeof api.newsfeed.queries.post>>;
const reactions = ["Like", "Celebrate", "Support", "Love", "Insightful", "Funny"] as const;
type Reaction = (typeof reactions)[number];
const reactionEmoji: Record<(typeof reactions)[number], string> = {
  Like: "👍",
  Celebrate: "🎉",
  Support: "🙌",
  Love: "❤️",
  Insightful: "💡",
  Funny: "😂",
};
type Media = Post["media"][number];
const postVideoThreshold = 0.5;
let playingPostVideo: HTMLVideoElement | null = null;

const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please retry.";
export function MediaItem({
  media,
  auto = false,
  autoPlayVideo = false,
  playInView = false,
  storyMode = false,
  onVideoEnded,
  onVideoProgress,
}: {
  media: Media;
  auto?: boolean;
  autoPlayVideo?: boolean;
  playInView?: boolean;
  storyMode?: boolean;
  onVideoEnded?: () => void;
  onVideoProgress?: (percent: number) => void;
}) {
  const client = useConvex();
  const container = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const download = useRef<{ url?: string } | null>(null);
  const [url, setUrl] = useState("");
  const [inView, setInView] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isVideo = media.mime.startsWith("video/");
  const isPhoto = auto && media.mime.startsWith("image/");
  const isStoryVideo = autoPlayVideo && isVideo;
  const isPostVideo = playInView && isVideo;

  useEffect(
    () => () => {
      if (download.current?.url) URL.revokeObjectURL(download.current.url);
      download.current = null;
    },
    [],
  );

  async function load() {
    if (download.current) return;
    const request: { url?: string } = {};
    download.current = request;
    setBusy(true);
    setError("");
    try {
      const blob = await readMedia(client, media._id, media.mime);
      if (download.current !== request) return;
      request.url = URL.createObjectURL(blob);
      setUrl(request.url);
    } catch (e) {
      if (download.current === request) setError(message(e));
    } finally {
      if (download.current === request) {
        if (!request.url) download.current = null;
        setBusy(false);
      }
    }
  }
  const loadWhenVisible = useEffectEvent(() => void load());

  useEffect(() => {
    if ((!isPhoto && !isStoryVideo && !isPostVideo) || !container.current) return;
    if (typeof IntersectionObserver === "undefined") {
      if (!isStoryVideo) return;
      const timeout = window.setTimeout(loadWhenVisible, 0);
      return () => window.clearTimeout(timeout);
    }
    let watching = true;
    let requested = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!watching || !entry) return;
        const visible =
          entry.isIntersecting && (!isPostVideo || entry.intersectionRatio >= postVideoThreshold);
        if (isPostVideo) setInView(visible);
        if (!visible || requested) return;

        requested = true;
        if (!isPostVideo) observer.disconnect();
        loadWhenVisible();
      },
      {
        rootMargin: isPhoto ? "300px 0px" : "0px",
        threshold: isPostVideo ? postVideoThreshold : 0,
      },
    );
    observer.observe(container.current);
    return () => {
      watching = false;
      observer.disconnect();
    };
  }, [isPhoto, isPostVideo, isStoryVideo, media._id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!isPostVideo || !url || !video) return;

    let active = true;
    if (inView) {
      void video.play().catch(async (error: unknown) => {
        if (
          !active ||
          video.muted ||
          !(error instanceof DOMException) ||
          error.name !== "NotAllowedError"
        ) {
          return;
        }
        video.muted = true;
        await video.play().catch(() => {
          if (active) video.muted = false;
        });
      });
    }
    return () => {
      active = false;
      if (inView || !video.paused) video.pause();
      if (playingPostVideo === video) playingPostVideo = null;
    };
  }, [inView, isPostVideo, url]);

  function handlePostVideoPlay(event: React.SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (video.paused) return;
    if (playingPostVideo && playingPostVideo !== video) playingPostVideo.pause();
    playingPostVideo = video;
  }

  function handlePostVideoStop(event: React.SyntheticEvent<HTMLVideoElement>) {
    if (playingPostVideo === event.currentTarget) playingPostVideo = null;
  }

  return (
    <div
      ref={container}
      className={
        storyMode
          ? "flex size-full min-h-0 items-center justify-center overflow-hidden bg-black"
          : "relative min-w-0 overflow-hidden rounded-xl bg-muted/30"
      }
    >
      {url ? (
        media.mime.startsWith("image/") ? (
          <img
            src={url}
            alt={media.name}
            className={
              storyMode
                ? "size-full object-contain"
                : "max-h-[min(70vh,42rem)] w-full object-contain"
            }
          />
        ) : (
          <video
            ref={videoRef}
            controls
            preload="none"
            playsInline
            autoPlay={autoPlayVideo}
            muted={autoPlayVideo || undefined}
            src={url}
            aria-label={media.name}
            onPlay={isPostVideo ? handlePostVideoPlay : undefined}
            onPause={isPostVideo ? handlePostVideoStop : undefined}
            onEnded={isPostVideo ? handlePostVideoStop : onVideoEnded}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              if (video.duration > 0) onVideoProgress?.((video.currentTime / video.duration) * 100);
            }}
            className={storyMode ? "size-full object-contain" : "max-h-[min(70vh,42rem)] w-full"}
          >
            <track kind="captions" />
            Your browser does not support video playback.
          </video>
        )
      ) : (
        <div
          className={`flex items-center justify-center p-5 text-center ${storyMode ? "size-full" : "min-h-52"}`}
        >
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{media.name}</p>
            {isVideo || error ? (
              <Button variant="outline" onClick={() => void load()} disabled={busy}>
                {busy ? "Loading media…" : error ? "Retry loading media" : "Load video"}
              </Button>
            ) : busy ? (
              <p role="status" className="text-sm">
                Loading photo…
              </p>
            ) : (
              <Button variant="outline" onClick={() => void load()}>
                Load photo
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="absolute inset-x-2 bottom-2 rounded-md bg-background/95 p-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
function AdditionalMedia({ post }: { post: Pick<Post, "_id" | "media"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.newsfeed.queries.media,
    { postId: post._id },
    { initialNumItems: 8 },
  );
  const initialIds = new Set(post.media.map((media) => media._id));
  const additional = results.filter((media) => !initialIds.has(media._id));
  return (
    <>
      <div className={`grid gap-3 ${additional.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {additional.map((media) => (
          <MediaItem key={media._id} media={media} auto playInView />
        ))}
      </div>
      {status === "LoadingFirstPage" && <p role="status">Loading media…</p>}
      {status === "CanLoadMore" && (
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => loadMore(12)}>
          Load more media
        </Button>
      )}
    </>
  );
}
function Gallery({ post }: { post: Pick<Post, "_id" | "media" | "mediaCount"> }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${post.media.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {post.media.map((m) => (
          <MediaItem key={m._id} media={m} auto playInView />
        ))}
      </div>
      {post.mediaCount > post.media.length && !expanded && (
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setExpanded(true)}>
          Show more media
        </Button>
      )}
      {expanded && <AdditionalMedia post={post} />}
    </div>
  );
}
function PostText({ post }: { post: Pick<Post, "preview" | "bodyId" | "bodySize"> }) {
  const client = useConvex();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const expandable = post.bodySize > new Blob([post.preview]).size;
  async function expand() {
    if (!post.bodyId) return;
    setBusy(true);
    try {
      setText(await (await readMedia(client, post.bodyId, "text/plain")).text());
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="break-words whitespace-pre-wrap">{text ?? post.preview}</p>
      {expandable && (
        <button
          disabled={busy}
          className="text-sm underline"
          onClick={() => (text === null ? expand() : setText(null))}
        >
          {busy ? "Loading text…" : text === null ? "Read full post" : "Show less"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function Author({
  author,
  avatarClassName = "size-11",
  mobileMeta,
}: {
  author: Post["author"];
  avatarClassName?: string;
  mobileMeta?: string;
}) {
  return (
    <Link href={`/people/${author.id}`} className="flex min-w-0 items-center gap-3 font-semibold">
      <Avatar className={avatarClassName}>
        <AvatarImage src={author.avatarUrl ?? undefined} alt="" />
        <AvatarFallback>{author.name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate">
        <span className={`block truncate ${mobileMeta ? "text-base sm:text-sm" : "text-sm"}`}>
          {author.name}
        </span>
        {mobileMeta && (
          <span className="block truncate text-xs font-normal text-muted-foreground sm:hidden">
            {mobileMeta}
          </span>
        )}
        {author.headline && (
          <span
            className={`block truncate text-xs font-normal text-muted-foreground ${mobileMeta ? "hidden sm:block" : ""}`}
          >
            {author.headline}
          </span>
        )}
        {author.availability && (
          <span
            className={`mt-0.5 block w-fit truncate rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 ${mobileMeta ? "hidden sm:block" : ""}`}
          >
            {author.availability}
          </span>
        )}
      </span>
    </Link>
  );
}
type CommentRecord = {
  _id: TConvexId<"socialComments">;
  authorId: TConvexId<"users">;
  body: string;
  updatedAt: number;
  author: Post["author"];
  reactionCount: number;
  viewerReaction: Reaction | null;
};
function CommentReactions({ comment }: { comment: CommentRecord }) {
  const { token } = useSocialSession();
  const react = useMutation(api.newsfeed.mutations.reactToComment);
  const [reactionState, setReactionState] = useState({
    server: comment.viewerReaction,
    selected: comment.viewerReaction,
  });
  const selected =
    reactionState.server === comment.viewerReaction
      ? reactionState.selected
      : comment.viewerReaction;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(kind: Reaction | null) {
    if (!token || busy) return;
    const previous = selected;
    setReactionState({ server: comment.viewerReaction, selected: kind });
    setBusy(true);
    setError("");
    try {
      await react({ token, commentId: comment._id, kind });
    } catch (reason) {
      setReactionState({ server: comment.viewerReaction, selected: previous });
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!token || busy}
            aria-label="React to comment"
            className="h-7 px-2"
          >
            {selected ? reactionEmoji[selected] : "👍"} {selected ?? "React"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" aria-label="Choose a comment reaction">
          <div role="group" aria-label="Comment reactions" className="flex gap-1">
            {reactions.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                aria-label={`React ${kind}`}
                aria-pressed={selected === kind}
                title={kind}
                className="text-xl"
                onClick={() => void choose(kind)}
              >
                {reactionEmoji[kind]}
              </Button>
            ))}
            {selected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void choose(null)}
              >
                Remove
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <span className="text-xs text-muted-foreground">{comment.reactionCount}</span>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
function CommentCard({ comment, children }: { comment: CommentRecord; children?: ReactNode }) {
  const { token, viewer } = useSocialSession();
  const client = useConvex();
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setEditing(false);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="rounded-2xl bg-muted/55 p-3 sm:p-4">
      <header className="flex items-start gap-2.5">
        <Link
          href={`/people/${comment.author.id}`}
          aria-label={`View ${comment.author.name}'s profile`}
          className="shrink-0"
        >
          <Avatar className="size-9">
            <AvatarImage src={comment.author.avatarUrl ?? undefined} alt="" />
            <AvatarFallback>{comment.author.name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1 rounded-2xl bg-background px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <Link
              href={`/people/${comment.author.id}`}
              className="truncate text-sm font-semibold hover:underline"
            >
              {comment.author.name}
            </Link>
            <time
              className="text-[11px] text-muted-foreground"
              dateTime={new Date(comment.updatedAt).toISOString()}
            >
              {relativePostTime(comment.updatedAt)}
            </time>
          </div>
          {editing ? (
            <div className="mt-2 space-y-2">
              <label htmlFor={`edit-comment-${comment._id}`} className="sr-only">
                Edit comment
              </label>
              <Textarea
                id={`edit-comment-${comment._id}`}
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
                disabled={busy}
                maxLength={3000}
                className="min-h-16 bg-background"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy || !editBody.trim()}
                  onClick={() =>
                    void run(() =>
                      client.mutation(api.newsfeed.mutations.editComment, {
                        token,
                        commentId: comment._id,
                        body: editBody,
                        deleted: false,
                      }),
                    )
                  }
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm leading-6 break-words whitespace-pre-wrap">{comment.body}</p>
          )}
        </div>
      </header>
      <div className="mt-1 ml-11 flex flex-wrap items-center gap-x-2 gap-y-1">
        <CommentReactions comment={comment} />
        {viewer?._id === comment.authorId && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className="h-7 px-2 text-xs"
              onClick={() => {
                setEditing(true);
                setEditBody(comment.body);
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className="h-7 px-2 text-xs text-destructive"
              onClick={() => {
                if (window.confirm("Delete this comment and its replies?"))
                  void run(() =>
                    client.mutation(api.newsfeed.mutations.editComment, {
                      token,
                      commentId: comment._id,
                      deleted: true,
                    }),
                  );
              }}
            >
              Delete
            </Button>
          </>
        )}
        {viewer && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => {
              const reason = window.prompt("Why are you reporting this comment?");
              if (reason?.trim())
                void run(() =>
                  client.mutation(api.newsfeed.mutations.report, {
                    token,
                    commentId: comment._id,
                    reason,
                  }),
                );
            }}
          >
            Report
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 ml-11 text-xs text-destructive">
          {error}
        </p>
      )}
      {children}
    </article>
  );
}
function CommentReplies({
  commentId,
  postId,
}: {
  commentId: TConvexId<"socialComments">;
  postId: TConvexId<"socialPosts">;
}) {
  const { token, viewer } = useSocialSession();
  const client = useConvex();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestKey = useRef(crypto.randomUUID());
  const { results, status, loadMore } = usePaginatedQuery(
    api.newsfeed.queries.replies,
    { commentId, ...(token ? { token } : {}) },
    { initialNumItems: 5 },
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await client.mutation(api.newsfeed.mutations.comment, {
        token,
        postId,
        parentId: commentId,
        requestId: requestKey.current,
        body,
      });
      setBody("");
      requestKey.current = crypto.randomUUID();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 ml-6 space-y-2 border-l-2 border-border pl-2 sm:ml-11 sm:pl-3">
      {results.map((reply) => (
        <CommentCard key={reply._id} comment={reply} />
      ))}
      {status === "LoadingFirstPage" && (
        <p role="status" className="text-xs text-muted-foreground">
          Loading replies…
        </p>
      )}
      {status === "CanLoadMore" && (
        <Button type="button" variant="ghost" size="sm" onClick={() => loadMore(5)}>
          Load more replies
        </Button>
      )}
      {viewer && (
        <form
          onSubmit={(event) => void submit(event)}
          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-end gap-2 sm:flex"
        >
          <Avatar className="mb-1 size-8 shrink-0">
            <AvatarImage src={viewer.avatarUrl ?? undefined} alt="" />
            <AvatarFallback>{viewer.name?.slice(0, 1).toUpperCase() ?? "H"}</AvatarFallback>
          </Avatar>
          <label htmlFor={`reply-box-${commentId}`} className="sr-only">
            Write a reply
          </label>
          <Textarea
            id={`reply-box-${commentId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={busy}
            maxLength={3000}
            className="min-h-10 min-w-0 flex-1 resize-y rounded-2xl bg-background py-2"
            placeholder="Write a reply…"
          />
          <Button
            size="sm"
            className="col-start-2 ml-auto shrink-0 sm:ml-0"
            disabled={busy || !body.trim()}
          >
            {busy ? "Sending…" : "Reply"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
function Thread({
  comment,
  postId,
}: {
  comment: CommentRecord & { replyCount: number };
  postId: TConvexId<"socialPosts">;
}) {
  const [open, setOpen] = useState(false);
  const { viewer } = useSocialSession();
  return (
    <CommentCard comment={comment}>
      {open ? (
        <CommentReplies commentId={comment._id} postId={postId} />
      ) : viewer ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1 ml-11 h-7 px-2"
          onClick={() => setOpen(true)}
        >
          {comment.replyCount > 0
            ? `View ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}`
            : "Reply"}
        </Button>
      ) : comment.replyCount > 0 ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1 ml-11 h-7 px-2"
          onClick={() => setOpen(true)}
        >
          View {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
        </Button>
      ) : null}
    </CommentCard>
  );
}
function Comments({ postId }: { postId: TConvexId<"socialPosts"> }) {
  const { token, viewer } = useSocialSession();
  const client = useConvex();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const { results, status, loadMore } = usePaginatedQuery(
    api.newsfeed.queries.comments,
    { postId, ...(token ? { token } : {}) },
    { initialNumItems: 10 },
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await client.mutation(api.newsfeed.mutations.comment, {
        token,
        postId,
        requestId: key.current,
        body,
      });
      setBody("");
      key.current = crypto.randomUUID();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id={`comments-${postId}`} aria-label="Comments" className="space-y-4 border-t pt-4">
      {status === "LoadingFirstPage" && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading comments…
        </p>
      )}
      {results.map((comment) => (
        <Thread key={comment._id} comment={comment} postId={postId} />
      ))}
      {status === "CanLoadMore" && (
        <Button type="button" variant="outline" size="sm" onClick={() => loadMore(10)}>
          Load more comments
        </Button>
      )}
      {viewer && (
        <form
          onSubmit={(event) => void submit(event)}
          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-end gap-2 sm:flex sm:gap-3"
        >
          <Avatar className="mb-1 size-9 shrink-0">
            <AvatarImage src={viewer.avatarUrl ?? undefined} alt="" />
            <AvatarFallback>{viewer.name?.slice(0, 1).toUpperCase() ?? "H"}</AvatarFallback>
          </Avatar>
          <label htmlFor={`new-comment-${postId}`} className="sr-only">
            Write a comment
          </label>
          <Textarea
            id={`new-comment-${postId}`}
            className="min-h-11 min-w-0 flex-1 resize-y rounded-2xl bg-muted/50 py-2.5"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={busy}
            maxLength={3000}
            placeholder="Write a comment…"
          />
          <Button
            disabled={busy || !body.trim()}
            className="col-start-2 mb-0.5 ml-auto shrink-0 sm:ml-0"
          >
            {busy ? "Posting…" : "Post"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
function relativePostTime(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function PostCard({ post, variant = "feed" }: { post: Post; variant?: "feed" | "detail" }) {
  const { token, viewer } = useSocialSession();
  const client = useConvex();
  const [comments, setComments] = useState(variant === "detail");
  const [repost, setRepost] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [reactionState, setReactionState] = useState({
    server: post.viewerReaction,
    confirmed: post.viewerReaction,
    selected: post.viewerReaction,
  });
  const stateMatchesServer = reactionState.server === post.viewerReaction;
  const confirmedReaction = stateMatchesServer ? reactionState.confirmed : post.viewerReaction;
  const selectedReaction = stateMatchesServer ? reactionState.selected : post.viewerReaction;
  const react = useMutation(api.newsfeed.mutations.react);
  async function run(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function share(native: boolean) {
    const url = `${location.origin}/newsfeed/${post._id}`;
    if (native && navigator.share)
      await navigator.share({ title: `Post by ${post.author.name}`, url });
    else {
      await navigator.clipboard.writeText(url);
      setNotice(native ? "Link copied because sharing is unavailable." : "Link copied.");
    }
  }
  async function chooseReaction(kind: Post["viewerReaction"]) {
    if (!token) return;
    setError("");
    setBusy(true);
    setReactionState({ server: post.viewerReaction, confirmed: confirmedReaction, selected: kind });
    try {
      await react({ token, postId: post._id, kind });
      setReactionState({ server: post.viewerReaction, confirmed: kind, selected: kind });
    } catch (e) {
      setReactionState({
        server: post.viewerReaction,
        confirmed: confirmedReaction,
        selected: confirmedReaction,
      });
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const published = post.publishedAt ?? post._creationTime;
  return (
    <article
      data-newsfeed-variant={variant}
      className="hr-card-surface hr-newsfeed-post-card overflow-hidden rounded-2xl"
    >
      {post.originalId && (
        <div className="flex items-center gap-2 border-b bg-orange-50/60 px-4 py-2 text-xs text-slate-600 dark:bg-orange-950/20 dark:text-slate-300">
          <Repeat2 aria-hidden="true" className="size-3.5 text-orange-600" />
          <span>{post.author.name} reposted with perspective</span>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(published).toISOString()}>{relativePostTime(published)}</time>
        </div>
      )}
      <header
        className={`flex items-start justify-between gap-3 ${variant === "detail" ? "border-b bg-card p-5 sm:p-6" : "px-7 pt-7 sm:px-5 sm:pt-5"}`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <Author
            author={post.author}
            avatarClassName="size-12 sm:size-11"
            mobileMeta={
              variant === "feed"
                ? `${relativePostTime(published)}${post.author.headline ? ` · ${post.author.headline}` : ""}`
                : undefined
            }
          />
          {variant === "detail" && (
            <span className="mt-1 hidden rounded-md bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 sm:inline-flex dark:bg-orange-950/40 dark:text-orange-200">
              Public Ecosystem
            </span>
          )}
        </div>
        <div className="flex max-w-[45%] min-w-0 shrink-0 items-center gap-1 sm:max-w-none">
          <Link
            className={`min-w-0 text-right text-xs text-muted-foreground hover:underline ${variant === "feed" ? "hidden sm:block" : ""}`}
            href={`/newsfeed/${post._id}`}
          >
            <time className="block truncate" dateTime={new Date(published).toISOString()}>
              {variant === "detail"
                ? new Date(published).toLocaleString()
                : relativePostTime(published)}
            </time>
          </Link>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Post options">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-44 flex-col gap-1 p-2">
              {viewer?._id === post.authorId && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setBody(
                          post.bodyId
                            ? await (await readMedia(client, post.bodyId, "text/plain")).text()
                            : "",
                        );
                        setEditing(true);
                      })
                    }
                  >
                    Edit post
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start text-destructive"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Delete this post?"))
                        void run(() =>
                          client.mutation(api.newsfeed.mutations.deletePost, {
                            token,
                            postId: post._id,
                          }),
                        );
                    }}
                  >
                    Delete post
                  </Button>
                </>
              )}
              {viewer && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt("Why are you reporting this post?");
                    if (reason?.trim())
                      void run(async () => {
                        await client.mutation(api.newsfeed.mutations.report, {
                          token,
                          postId: post._id,
                          reason,
                        });
                        setNotice("Report submitted.");
                      });
                  }}
                >
                  Report post
                </Button>
              )}
              <div className="my-1 border-t" />
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                disabled={busy}
                onClick={() => void run(() => share(true))}
              >
                <Share2 aria-hidden="true" className="mr-2 size-4" /> Share post
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                disabled={busy}
                onClick={() => void run(() => share(false))}
              >
                <Copy aria-hidden="true" className="mr-2 size-4" />
                Copy link
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </header>
      <div
        className={`space-y-4 ${variant === "detail" ? "px-5 py-4 sm:px-7" : "px-7 py-6 sm:px-5 sm:py-4"}`}
      >
        <div
          className={
            variant === "detail"
              ? "text-lg leading-8 sm:text-xl"
              : "text-xl leading-8 sm:text-lg sm:leading-7"
          }
        >
          <PostText key={post.bodyId ?? "empty"} post={post} />
        </div>
        {!!post.tags?.length && (
          <div className="flex flex-wrap gap-2" aria-label="Post tags">
            {post.tags.map((tag) => (
              <Link key={tag} href={`/newsfeed/search?tag=${encodeURIComponent(tag)}`}>
                <TagChip>#{tag}</TagChip>
              </Link>
            ))}
          </div>
        )}
        {post.milestone && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/70 px-3 py-2 text-sm dark:border-orange-900 dark:bg-orange-950/20">
            <span className="font-medium">Milestone · {post.milestone.title}</span>
            <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
              {post.milestone.status}
            </span>
            <span className="text-xs text-muted-foreground">
              Status shown from Highrable application records.
            </span>
          </div>
        )}
        {post.mediaCount > 0 && <Gallery post={post} />}
        {post.originalId &&
          (post.original ? (
            <blockquote className="space-y-3 rounded-xl border-l-2 bg-muted/20 p-4 pl-4">
              <Author author={post.original.author} />
              <PostText key={post.original.bodyId ?? "empty"} post={post.original} />
              {post.original.mediaCount > 0 && <Gallery post={post.original} />}
              <Link href={`/newsfeed/${post.original._id}`} className="text-sm underline">
                View original post
              </Link>
            </blockquote>
          ) : (
            <p className="rounded-xl bg-muted p-4">Original post unavailable.</p>
          ))}
      </div>
      <div
        className={`hr-newsfeed-post-engagement flex items-center justify-between border-b py-3 text-sm text-muted-foreground ${variant === "detail" ? "px-5 sm:px-7" : "px-4 sm:px-5"}`}
      >
        <span className="flex items-center gap-1.5">
          {post.reactionCount > 0 && (
            <span className="text-base" aria-hidden="true">
              👍❤️
            </span>
          )}
          <span>{post.reactionCount} reactions</span>
        </span>
        <button type="button" className="hover:underline" onClick={() => setComments(true)}>
          {post.commentCount} comments
        </button>
      </div>
      <div
        className={`hr-newsfeed-post-actions grid ${viewer ? "grid-cols-3" : "grid-cols-1"} gap-1 border-b py-1 ${variant === "detail" ? "px-5 sm:px-7" : "px-3 sm:px-4"}`}
      >
        {viewer && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="h-12 w-full min-w-0 flex-col justify-center gap-0 px-1 text-[11px] leading-tight sm:h-10 sm:flex-row sm:gap-1 sm:px-2 sm:text-sm"
              >
                <span className="text-lg leading-none" aria-hidden="true">
                  {selectedReaction ? (
                    reactionEmoji[selectedReaction as (typeof reactions)[number]]
                  ) : (
                    <ThumbsUp className="size-4" />
                  )}
                </span>
                <span className="max-w-full truncate text-[10px] sm:text-sm">
                  {selectedReaction ?? "Like"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" aria-label="Choose a reaction">
              <div role="group" aria-label="Reactions" className="flex gap-1">
                {reactions.map((kind) => (
                  <Button
                    key={kind}
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    aria-label={`React ${kind}`}
                    aria-pressed={selectedReaction === kind}
                    title={kind}
                    className="text-xl"
                    onClick={() => void chooseReaction(kind)}
                  >
                    {reactionEmoji[kind]}
                  </Button>
                ))}
                {selectedReaction && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void chooseReaction(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
        <Button
          variant="ghost"
          className="h-12 w-full min-w-0 flex-col justify-center gap-0 px-1 text-[11px] leading-tight sm:h-10 sm:flex-row sm:gap-1 sm:px-2 sm:text-sm"
          aria-expanded={comments}
          onClick={() => setComments(!comments)}
        >
          <MessageCircle aria-hidden="true" className="size-4" /> Comment
        </Button>
        {viewer && (
          <Button
            variant="ghost"
            className="h-12 w-full min-w-0 flex-col justify-center gap-0 px-1 text-[11px] leading-tight sm:h-10 sm:flex-row sm:gap-1 sm:px-2 sm:text-sm"
            aria-expanded={repost}
            onClick={() => setRepost(!repost)}
          >
            <Share2 aria-hidden="true" className="size-4" /> Repost
          </Button>
        )}
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const bodyId = await uploadMedia(client, {
                token,
                postId: post._id,
                requestId: crypto.randomUUID(),
                file: new File([body], "post.txt", { type: "text/plain" }),
                signal: new AbortController().signal,
                onProgress: () => {},
              });
              await client.mutation(api.newsfeed.mutations.editPost, {
                token,
                postId: post._id,
                bodyId,
              });
              setEditing(false);
            });
          }}
        >
          <div className="block">
            <label htmlFor={`edit-post-${post._id}`}>Edit post text</label>
            <Textarea
              id={`edit-post-${post._id}`}
              className="mt-2"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <Button disabled={busy || !body.trim()}>Save changes</Button>
          <Button type="button" variant="ghost" className="ml-3" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      )}
      {repost && <Composer originalId={post._id} onDone={() => setRepost(false)} />}
      {comments && (
        <div
          className={variant === "detail" ? "bg-muted/30 px-5 py-5 sm:px-7" : "px-4 py-4 sm:px-5"}
        >
          <Comments postId={post._id} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </article>
  );
}
export function Feed({
  authorId,
  followingOnly = false,
}: {
  authorId?: TConvexId<"users">;
  followingOnly?: boolean;
}) {
  const { token } = useSocialSession();
  const { results, status, loadMore } = usePaginatedQuery(
    api.newsfeed.queries.feed,
    {
      ...(authorId ? { authorId } : {}),
      ...(followingOnly ? { followingOnly: true } : {}),
      ...(token ? { token } : {}),
    },
    { initialNumItems: 10 },
  );
  return (
    <div className="hr-newsfeed-feed-list space-y-4">
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading posts…</p>
      ) : results.length === 0 ? (
        <p className="rounded-xl border bg-background p-5 text-sm text-muted-foreground">
          {followingOnly
            ? token
              ? "Your following feed is empty. Follow collaborators to see their posts here."
              : "Sign in with a verified wallet to use the following feed."
            : "No published posts yet. Be the first to share an update."}
        </p>
      ) : (
        results.map((post) => <PostCard key={post._id} post={post} />)
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(10)}>
          Load more posts
        </Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more posts…</p>}
    </div>
  );
}
