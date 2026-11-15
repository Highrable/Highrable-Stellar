"use client";
import { api, type TConvexId } from "@repo/convex-client";
import { Button } from "@repo/ui/components/ui/button";
import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { FunctionReturnType } from "convex/server";

import { readMedia, uploadMedia } from "./media-client";
import { useSocialSession } from "./session";

const Composer = dynamic(() => import("./composer").then((module) => module.Composer));
type Post = NonNullable<FunctionReturnType<typeof api.newsfeed.queries.post>>;
const reactions = ["Like", "Celebrate", "Support", "Love", "Insightful", "Funny"] as const;
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please retry.";
function MediaItem({ media }: { media: Post["media"][number] }) {
  const client = useConvex();
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
  return (
    <div className="min-w-0 rounded-lg border border-border/80 bg-muted/20 p-2">
      {url ? (
        media.mime.startsWith("image/") ? (
          <img
            src={url}
            alt={media.name}
            loading="lazy"
            className="max-h-96 w-full object-contain"
          />
        ) : (
          <video controls preload="metadata" src={url} className="w-full">
            <track kind="captions" />
            Your browser does not support video playback.
          </video>
        )
      ) : (
        <Button
          variant="ghost"
          onClick={load}
          disabled={busy}
          className="h-auto w-full py-8 break-words whitespace-normal"
        >
          {busy
            ? "Loading media…"
            : `Load ${media.name} (${(media.size / 1024 / 1024).toFixed(1)} MB)`}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
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
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {results
          .filter((media) => !initialIds.has(media._id))
          .map((media) => (
            <MediaItem key={media._id} media={media} />
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
      <div className="grid gap-3 sm:grid-cols-2">
        {post.media.map((m) => (
          <MediaItem key={m._id} media={m} />
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
      className="flex items-center gap-2 font-semibold"
    >
      {author.avatarUrl && (
        <img
          src={author.avatarUrl}
          alt=""
          width={36}
          height={36}
          className="size-9 rounded-full object-cover"
        />
      )}
      {author.name}
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
    <section aria-label="Comments" className="space-y-3 border-t pt-3">
      {results.map((c) => (
        <div key={c._id} className="space-y-2 rounded bg-muted/40 p-3">
          <Author author={c.author} />
          {editing === c._id ? (
            <>
              <label className="block">
                Edit comment
                <textarea
                  className="w-full border p-2"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />
              </label>
              <button
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
              </button>
              <button onClick={() => setEditing(null)} className="ml-3">
                Cancel
              </button>
            </>
          ) : (
            <p className="break-words whitespace-pre-wrap">{c.body}</p>
          )}
          {viewer?._id === c.authorId && (
            <div className="flex gap-3 text-sm">
              <button
                disabled={busy}
                onClick={() => {
                  setEditing(c._id);
                  setEditBody(c.body);
                }}
              >
                Edit
              </button>
              <button
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
              </button>
            </div>
          )}
          {viewer && (
            <button
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
            </button>
          )}
        </div>
      ))}
      {status === "LoadingFirstPage" && <p role="status">Loading comments…</p>}
      {status === "CanLoadMore" && <button onClick={() => loadMore(10)}>Load more comments</button>}
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
          <label className="block">
            Add a comment
            <textarea
              className="w-full rounded border p-2"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
            />
          </label>
          <button className="underline" disabled={busy || !body.trim()}>
            Comment
          </button>
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
  const [pendingReaction, setPendingReaction] = useState<Post["viewerReaction"] | undefined>();
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
  return (
    <article className="hr-card-surface space-y-4 p-4 sm:p-6">
      <header>
        <Author author={post.author} />
        <Link className="text-xs text-muted-foreground" href={`/newsfeed/${post._id}`}>
          <time dateTime={new Date(post.publishedAt ?? post._creationTime).toISOString()}>
            {new Date(post.publishedAt ?? post._creationTime).toLocaleString()}
          </time>
        </Link>
      </header>
      <PostText key={post.bodyId ?? "empty"} post={post} />
      {post.mediaCount > 0 && <Gallery post={post} />}
      {post.originalId &&
        (post.original ? (
          <blockquote className="space-y-3 border-l-2 pl-4">
            <Author author={post.original.author} />
            <PostText key={post.original.bodyId ?? "empty"} post={post.original} />
            {post.original.mediaCount > 0 && <Gallery post={post.original} />}
            <Link href={`/newsfeed/${post.original._id}`} className="text-sm underline">
              View original post
            </Link>
          </blockquote>
        ) : (
          <p className="rounded bg-muted p-4">Original post unavailable.</p>
        ))}
      <p className="text-sm">
        {post.reactionCount} reactions · {post.commentCount} comments
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        {viewer && (
          <label>
            Reaction{" "}
            <select
              className="rounded border p-1"
              aria-label="Choose a reaction"
              disabled={busy}
              value={
                pendingReaction === undefined
                  ? (post.viewerReaction ?? "")
                  : (pendingReaction ?? "")
              }
              onChange={(e) =>
                run(async () => {
                  const kind = e.target.value
                    ? (e.target.value as (typeof reactions)[number])
                    : null;
                  setPendingReaction(kind);
                  try {
                    await react({ token, postId: post._id, kind });
                    setPendingReaction(undefined);
                  } catch (error) {
                    setPendingReaction(undefined);
                    throw error;
                  }
                })
              }
            >
              <option value="">None</option>
              {reactions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
        <button aria-expanded={comments} onClick={() => setComments(!comments)}>
          Comments
        </button>
        {viewer && (
          <button aria-expanded={repost} onClick={() => setRepost(!repost)}>
            Repost
          </button>
        )}
        <button onClick={() => run(() => share(false))}>Copy link</button>
        <button onClick={() => run(() => share(true))}>Share</button>
        {viewer?._id === post.authorId && (
          <>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
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
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm("Delete this post?"))
                  void run(() =>
                    client.mutation(api.newsfeed.mutations.deletePost, { token, postId: post._id }),
                  );
              }}
            >
              Delete post
            </button>
          </>
        )}
        {viewer && (
          <button
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
            Report
          </button>
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
          <label className="block">
            Edit post text
            <textarea
              className="w-full border p-2"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button disabled={busy || !body.trim()}>Save changes</button>
          <button type="button" className="ml-3" onClick={() => setEditing(false)}>
            Cancel
          </button>
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
