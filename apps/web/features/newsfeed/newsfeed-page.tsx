"use client";
import { ProductPageHero } from "@/features/common/components/layout/product-page-hero";
import { api, type TConvexId } from "@repo/convex-client";
import { useQuery } from "convex/react";
import Link from "next/link";

import { Composer } from "./composer";
import { Feed, PostCard } from "./feed";
import { FeedBoundary } from "./feed-boundary";
import { PeopleSearch } from "./people-search";
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
    <PostCard post={post} />
  ) : (
    <p>This post is unavailable.</p>
  );
}
export function NewsfeedPage({ postId }: { postId?: string }) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <ProductPageHero
        title={<Link href="/newsfeed">Highrable Newsfeed</Link>}
        description="Work, ideas, and updates from the Highrable community."
        meta={postId ? "Community post" : "Community"}
      />
      <FeedBoundary>
        <SocialSession>
          {postId ? (
            <Permalink id={postId} />
          ) : (
            <>
              <PeopleSearch />
              <Composer />
              <Stories />
              <Feed />
            </>
          )}
        </SocialSession>
      </FeedBoundary>
    </div>
  );
}
