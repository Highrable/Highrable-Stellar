"use client";

import { api, type TConvexId } from "@repo/convex-client";
import {
  ProfileRow,
  SectionHeader,
  TagChip,
} from "@repo/ui/components/highrable/social-primitives";
import { useQuery } from "convex/react";
import { BriefcaseBusiness, Sparkles, Users } from "lucide-react";
import Link from "next/link";

import { FollowButton } from "./follow-button";
import { useSocialSession } from "./session";

export function NewsfeedSidebar({ variant = "search" }: { variant?: "feed" | "search" }) {
  const { token } = useSocialSession();
  const suggestions = useQuery(api.newsfeed.queries.suggestedPeople, token ? { token } : {});
  const tags = useQuery(api.newsfeed.queries.trendingTags, {});
  const isFeed = variant === "feed";

  const trendingSection = (
    <section
      className={`hr-card-surface rounded-2xl p-4 ${isFeed ? "space-y-3.5" : "space-y-3"}`}
      aria-label="Trending tags"
    >
      <SectionHeader
        title={
          isFeed ? (
            <span className="text-xs font-bold tracking-wide uppercase">Trending</span>
          ) : (
            "Trending in network"
          )
        }
        description={isFeed ? undefined : "Topics in published posts and active showcases"}
        icon={isFeed ? undefined : <Sparkles aria-hidden="true" className="size-4" />}
        className={isFeed ? "text-slate-500 dark:text-slate-400" : undefined}
      />
      {tags === undefined ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading tags…
        </p>
      ) : tags.length ? (
        isFeed ? (
          <ul className="space-y-3">
            {tags.map(({ tag, count }) => (
              <li key={tag}>
                <Link
                  href={`/newsfeed/search?tag=${encodeURIComponent(tag)}`}
                  aria-label={`Search tag ${tag}, ${count} mentions`}
                  className="group block rounded-md focus-visible:outline-none"
                >
                  <span className="block text-xs text-muted-foreground">
                    {count} {count === 1 ? "mention" : "mentions"}
                  </span>
                  <span className="text-sm font-semibold text-foreground group-hover:text-orange-700 dark:group-hover:text-orange-300">
                    #{tag}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map(({ tag }) => (
              <Link
                key={tag}
                href={`/newsfeed/search?tag=${encodeURIComponent(tag)}`}
                aria-label={`Search tag ${tag}`}
              >
                <TagChip>#{tag}</TagChip>
              </Link>
            ))}
          </div>
        )
      ) : (
        <p className="text-xs text-muted-foreground">
          Tags will appear as members publish content.
        </p>
      )}
      {!isFeed && (
        <Link
          href="/marketplace"
          className="flex items-center gap-2 border-t pt-3 text-xs font-medium text-orange-700 hover:underline dark:text-orange-300"
        >
          <BriefcaseBusiness aria-hidden="true" className="size-3.5" /> Explore public opportunities
        </Link>
      )}
    </section>
  );

  const suggestedSection = (
    <section
      className={`hr-card-surface rounded-2xl p-4 ${isFeed ? "space-y-3.5" : "space-y-4"}`}
      aria-label="Suggested collaborators"
    >
      <SectionHeader
        title={
          isFeed ? (
            <span className="text-xs font-bold tracking-wide uppercase">Suggested</span>
          ) : (
            "Suggested collaborators"
          )
        }
        description={isFeed ? undefined : "People on Highrable you can follow"}
        icon={isFeed ? undefined : <Users aria-hidden="true" className="size-4" />}
        className={isFeed ? "text-slate-500 dark:text-slate-400" : undefined}
      />
      {suggestions === undefined ? (
        <p role="status" className="text-xs text-muted-foreground">
          Loading people…
        </p>
      ) : suggestions.length ? (
        <ul className="space-y-3">
          {suggestions.map((person) => (
            <li key={person.id} className="flex items-center gap-2">
              <ProfileRow
                href={`/people/${person.id}`}
                name={person.name}
                headline={person.headline || "Highrable member"}
                avatarUrl={person.avatarUrl}
                className="min-w-0 flex-1"
              />
              <FollowButton userId={person.id as TConvexId<"users">} size="sm" compact={isFeed} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No collaborator suggestions yet.</p>
      )}
    </section>
  );

  return (
    <aside
      className={`hr-newsfeed-sidebar ${isFeed ? "hr-newsfeed-sidebar--feed" : ""} space-y-4 lg:sticky lg:top-20 lg:self-start`}
    >
      {isFeed ? (
        <>
          {trendingSection}
          {suggestedSection}
        </>
      ) : (
        <>
          {suggestedSection}
          {trendingSection}
        </>
      )}
    </aside>
  );
}
