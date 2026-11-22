"use client";
import { api, type TConvexId } from "@repo/convex-client";
import { Button } from "@repo/ui/components/ui/button";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Composer } from "./composer";
import { Feed, PostCard } from "./feed";
import { FeedBoundary } from "./feed-boundary";
import { NewsfeedSidebar } from "./newsfeed-sidebar";
import { SocialSession, useSocialSession } from "./session";
import { Stories } from "./stories";

function Permalink({ id }: { id: string }) {
  const { token } = useSocialSession();
  const post = useQuery(api.newsfeed.queries.post, {
    id: id as TConvexId<"socialPosts">,
    ...(token ? { token } : {}),
  });
  return post === undefined ? (
    <p role="status">Loading post…</p>
  ) : post ? (
    <PostCard post={post} variant="detail" />
  ) : (
    <p>This post is unavailable.</p>
  );
}
function NewsfeedContent({ postId }: { postId?: string }) {
  const [followingOnly, setFollowingOnly] = useState(false);
  const { token } = useSocialSession();
  return (
    <>
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2 text-xs text-slate-500 dark:border-slate-800">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-2">
            <li>Highrable</li>
            <li aria-hidden="true">›</li>
            <li>
              <Link href="/newsfeed" className="hover:text-orange-600">
                Newsfeed
              </Link>
            </li>
            {postId && (
              <>
                <li aria-hidden="true">›</li>
                <li className="font-medium text-slate-900 dark:text-slate-100">Post</li>
              </>
            )}
          </ol>
        </nav>
        <Link
          href="/newsfeed/search"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950/40"
        >
          <Search aria-hidden="true" className="size-3.5" /> Search
        </Link>
      </div>
      {postId ? (
        <main className="min-w-0">
          <Permalink id={postId} />
        </main>
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1.85fr)_minmax(15rem,1fr)]">
          <main className="min-w-0 space-y-4">
            <>
              <Stories />
              <Composer />
              <div className="flex flex-wrap items-center justify-between gap-3 py-1">
                <div
                  role="group"
                  aria-label="Newsfeed filter"
                  className="inline-flex rounded-lg border bg-slate-50 p-1 dark:bg-slate-900"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={!followingOnly ? "default" : "ghost"}
                    aria-pressed={!followingOnly}
                    onClick={() => setFollowingOnly(false)}
                    className={!followingOnly ? "bg-orange-600 text-white hover:bg-orange-700" : ""}
                  >
                    All Network
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={followingOnly ? "default" : "ghost"}
                    aria-pressed={followingOnly}
                    disabled={!token}
                    onClick={() => setFollowingOnly(true)}
                    className={followingOnly ? "bg-orange-600 text-white hover:bg-orange-700" : ""}
                  >
                    Peer Perspectives
                  </Button>
                </div>
                {!token && (
                  <span className="px-2 text-xs text-muted-foreground">
                    Connect a wallet to follow authors and build your network feed.
                  </span>
                )}
              </div>
              <Feed followingOnly={followingOnly} />
            </>
          </main>
          <NewsfeedSidebar />
        </div>
      )}
    </>
  );
}

export function NewsfeedPage({ postId }: { postId?: string }) {
  return (
    <div
      className={`mx-auto w-full px-3 py-3 sm:px-5 sm:py-4 ${postId ? "max-w-5xl" : "max-w-7xl"}`}
    >
      <FeedBoundary>
        <SocialSession>
          <NewsfeedContent postId={postId} />
        </SocialSession>
      </FeedBoundary>
    </div>
  );
}
