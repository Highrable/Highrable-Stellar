"use client";
import { api, type TConvexId } from "@repo/convex-client";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/ui/popover";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import { MessageCircle, MoreHorizontal, Share2, ThumbsUp } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { FunctionReturnType } from "convex/server";

import { readMedia, uploadMedia } from "./media-client";
import { useSocialSession } from "./session";

const Composer = dynamic(() => import("./composer").then((module) => module.Composer));
type Post = NonNullable<FunctionReturnType<typeof api.newsfeed.queries.post>>;
const reactions = ["Like", "Celebrate", "Support", "Love", "Insightful", "Funny"] as const;
const reactionEmoji: Record<(typeof reactions)[number], string> = {
  Like: "👍",
  Celebrate: "🎉",
  Support: "🙌",
  Love: "❤️",
  Insightful: "💡",
  Funny: "😂",
};
type Media = { _id: TConvexId<"socialMedia">; name: string; mime: string; size: number };
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please retry.";
export function MediaItem({
  media,
  auto = false,
  autoPlayVideo = false,
  storyMode = false,
  onVideoEnded,
  onVideoProgress,
}: {
  media: Media;
  auto?: boolean;
  autoPlayVideo?: boolean;
  storyMode?: boolean;
  onVideoEnded?: () => void;
  onVideoProgress?: (percent: number) => void;
}) {
  const client = useConvex();
  const container = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function load() {
    if (busy || url) return;
    setBusy(true);
    setError("");
    try {
      setUrl(URL.createObjectURL(await readMedia(client, media._id, media.mime)));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const isPhoto = auto && media.mime.startsWith("image/");
    const isStoryVideo = autoPlayVideo && media.mime.startsWith("video/");
    if ((!isPhoto && !isStoryVideo) || !container.current) return;
    if (typeof IntersectionObserver === "undefined") {
      if (!isStoryVideo) return;
      const timeout = window.setTimeout(() => void load(), 0);
      return () => window.clearTimeout(timeout);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: isStoryVideo ? "0px" : "300px 0px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [auto, autoPlayVideo, media._id]);
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
            controls
            preload="none"
            autoPlay={autoPlayVideo}
            muted={autoPlayVideo}
            src={url}
            aria-label={media.name}
            onEnded={onVideoEnded}
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
            {media.mime.startsWith("video/") || error ? (
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
          <MediaItem key={media._id} media={media} auto />
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
          <MediaItem key={m._id} media={m} auto />
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
function Author({ author }: { author: Post["author"] }) {
  return (
    <Link
      href={`/${author.role === "client" ? "clients" : "freelancers"}/${encodeURIComponent(author.walletAddress)}`}
      className="flex min-w-0 items-center gap-3 font-semibold"
    >
      <Avatar className="size-11">
        <AvatarImage src={author.avatarUrl ?? undefined} alt="" />
        <AvatarFallback>{author.name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="truncate">{author.name}</span>
    </Link>
  );
}
function Comments({ postId }: { postId: TConvexId<"socialPosts"> }) {
  const { token, viewer } = useSocialSession();
  const client = useConvex();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const [editing, setEditing] = useState<TConvexId<"socialComments"> | null>(null);
  const [editBody, setEditBody] = useState("");
  const { results, status, loadMore } = usePaginatedQuery(
    api.newsfeed.queries.comments,
    { postId },
    { initialNumItems: 10 },
  );
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id={`comments-${postId}`} aria-label="Comments" className="space-y-3 border-t pt-3">
      {results.map((c) => (
        <div key={c._id} className="space-y-2 rounded-xl bg-muted/40 p-3">
          <Author author={c.author} />
          {editing === c._id ? (
            <>
              <div className="block">
                <label htmlFor={`edit-comment-${c._id}`}>Edit comment</label>
                <Textarea
                  id={`edit-comment-${c._id}`}
                  className="mt-2"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await client.mutation(api.newsfeed.mutations.editComment, {
                      token,
                      commentId: c._id,
                      body: editBody,
                      deleted: false,
                    });
                    setEditing(null);
                  })
                }
              >
                Save comment
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)} className="ml-2">
                Cancel
              </Button>
            </>
          ) : (
            <p className="break-words whitespace-pre-wrap">{c.body}</p>
          )}
          {viewer?._id === c.authorId && (
            <div className="flex gap-3 text-sm">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setEditing(c._id);
                  setEditBody(c.body);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    client.mutation(api.newsfeed.mutations.editComment, {
                      token,
                      commentId: c._id,
                      deleted: true,
                    }),
                  )
                }
              >
                Delete
              </Button>
            </div>
          )}
          {viewer && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              className="text-sm underline"
              onClick={() => {
                const reason = window.prompt("Why are you reporting this comment?");
                if (reason?.trim())
                  void run(() =>
                    client.mutation(api.newsfeed.mutations.report, {
                      token,
                      commentId: c._id,
                      reason,
                    }),
                  );
              }}
            >
              Report comment
            </Button>
          )}
        </div>
      ))}
      {status === "LoadingFirstPage" && <p role="status">Loading comments…</p>}
      {status === "CanLoadMore" && (
        <Button variant="outline" size="sm" onClick={() => loadMore(10)}>
          Load more comments
        </Button>
      )}
      {viewer && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await client.mutation(api.newsfeed.mutations.comment, {
                token,
                postId,
                requestId: key.current,
                body,
              });
              setBody("");
              key.current = crypto.randomUUID();
            });
          }}
        >
          <div className="block">
            <label htmlFor={`new-comment-${postId}`}>Add a comment</label>
            <Textarea
              id={`new-comment-${postId}`}
              className="mt-2"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button className="mt-2" size="sm" disabled={busy || !body.trim()}>
            Comment
          </Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function PostCard({ post }: { post: Post }) {
  const { token, viewer } = useSocialSession();
  const client = useConvex();
  const [comments, setComments] = useState(false);
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
      setNotice("Link copied.");
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
    <article className="hr-card-surface overflow-hidden rounded-2xl p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <Author author={post.author} />
        <div className="flex shrink-0 items-center gap-1">
          <Link
            className="text-xs text-muted-foreground hover:underline"
            href={`/newsfeed/${post._id}`}
          >
            <time dateTime={new Date(published).toISOString()}>
              {new Date(published).toLocaleString()}
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
            </PopoverContent>
          </Popover>
        </div>
      </header>
      <div className="space-y-4 py-4">
        <div className="text-base leading-7 sm:text-lg">
          <PostText key={post.bodyId ?? "empty"} post={post} />
        </div>
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
      <div className="flex items-center justify-between border-b py-2 text-sm text-muted-foreground">
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
      <div className="grid grid-cols-3 gap-1 border-b py-1">
        {viewer && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="h-10 w-full">
                <span className="text-lg" aria-hidden="true">
                  {selectedReaction ? (
                    reactionEmoji[selectedReaction as (typeof reactions)[number]]
                  ) : (
                    <ThumbsUp className="size-4" />
                  )}
                </span>
                <span>{selectedReaction ?? "Like"}</span>
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
          className="h-10"
          aria-expanded={comments}
          onClick={() => setComments(!comments)}
        >
          <MessageCircle aria-hidden="true" className="size-4" /> Comment
        </Button>
        {viewer && (
          <Button
            variant="ghost"
            className="h-10"
            aria-expanded={repost}
            onClick={() => setRepost(!repost)}
          >
            <Share2 aria-hidden="true" className="size-4" /> Repost
          </Button>
        )}
        {!viewer && (
          <Button variant="ghost" className="h-10" onClick={() => void run(() => share(false))}>
            Copy link
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={() => void run(() => share(false))}>
          Copy link
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void run(() => share(true))}>
          Share
        </Button>
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
      {comments && <Comments postId={post._id} />}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </article>
  );
}
export function Feed({ authorId }: { authorId?: TConvexId<"users"> }) {
  const { token } = useSocialSession();
  const { results, status, loadMore } = usePaginatedQuery(
    api.newsfeed.queries.feed,
    { ...(authorId ? { authorId } : {}), ...(token ? { token } : {}) },
    { initialNumItems: 10 },
  );
  return (
    <div className="space-y-4">
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading posts…</p>
      ) : results.length === 0 ? (
        <p>No posts yet.</p>
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
