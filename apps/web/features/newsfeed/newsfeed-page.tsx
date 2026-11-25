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
import { SocialSessionStatus, useSocialSession } from "./session";
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
      <div className="hr-newsfeed-breadcrumb mb-3 flex items-center justify-between border-b border-slate-200 pb-2 text-xs text-slate-500 dark:border-slate-800">
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
        <div className="hr-newsfeed-feed-layout grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2.25fr)_minmax(15rem,1fr)] lg:gap-6">
          <main className="min-w-0 space-y-8 sm:space-y-4">
            <>
              <Composer />
              <Stories />
              <div className="hidden flex-wrap items-center justify-between gap-3 py-1 sm:flex">
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
                    className={!followingOnly ? "hr-v2-button-primary" : ""}
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
                    className={followingOnly ? "hr-v2-button-primary" : ""}
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
          <NewsfeedSidebar variant="feed" />
        </div>
      )}
    </>
  );
}

export function NewsfeedPage({ postId }: { postId?: string }) {
  return (
    <div
      className={`hr-newsfeed-page mx-auto w-full px-3 py-3 sm:px-5 sm:py-4 ${postId ? "max-w-5xl" : "max-w-7xl max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:px-2 max-sm:py-0"}`}
    >
      <FeedBoundary>
        <SocialSessionStatus />
        <NewsfeedContent postId={postId} />
      </FeedBoundary>
    </div>
  );
}
