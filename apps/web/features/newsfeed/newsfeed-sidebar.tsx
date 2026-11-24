"use client";

import { api, type TConvexId } from "@repo/convex-client";
import {
  ProfileRow,
  SectionHeader,
  TagChip,
} from "@repo/ui/components/highrable/social-primitives";
import { useQuery } from "convex/react";
import { Activity, BriefcaseBusiness, Sparkles, Users } from "lucide-react";
import Link from "next/link";

import { FollowButton } from "./follow-button";
import { useSocialSession } from "./session";

export function NewsfeedSidebar() {
  const { token, viewer } = useSocialSession();
  const suggestions = useQuery(api.newsfeed.queries.suggestedPeople, token ? { token } : {});
  const tags = useQuery(api.newsfeed.queries.trendingTags, {});

  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
      <section className="hr-card-surface space-y-3 rounded-2xl p-4" aria-label="Availability">
        <SectionHeader
          title="Availability"
          description={viewer?.availability || "Tell clients when you are ready for a project."}
          icon={<Activity aria-hidden="true" className="size-4" />}
          action={
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {viewer?.availability ? "Set" : "Not set"}
            </span>
          }
        />
        {viewer ? (
          <Link
            href={`/people/${viewer._id}`}
            className="block w-full rounded-md border border-orange-200 px-3 py-2 text-center text-sm font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-200"
          >
            Update project availability
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">
            Connect a wallet to publish your availability.
          </p>
        )}
      </section>

      <section
        className="hr-card-surface space-y-4 rounded-2xl p-4"
        aria-label="Suggested collaborators"
      >
        <SectionHeader
          title="Suggested collaborators"
          description="Professional profiles in your network"
          icon={<Users aria-hidden="true" className="size-4" />}
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
                <FollowButton userId={person.id as TConvexId<"users">} size="sm" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No collaborator suggestions yet.</p>
        )}
      </section>

      <section className="hr-card-surface space-y-3 rounded-2xl p-4" aria-label="Trending tags">
        <SectionHeader
          title="Trending in network"
          description="Topics in published posts and active showcases"
          icon={<Sparkles aria-hidden="true" className="size-4" />}
        />
        {tags === undefined ? (
          <p role="status" className="text-xs text-muted-foreground">
            Loading tags…
          </p>
        ) : tags.length ? (
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
        ) : (
          <p className="text-xs text-muted-foreground">
            Tags will appear as members publish content.
          </p>
        )}
        <Link
          href="/marketplace"
          className="flex items-center gap-2 border-t pt-3 text-xs font-medium text-orange-700 hover:underline dark:text-orange-300"
        >
          <BriefcaseBusiness aria-hidden="true" className="size-3.5" /> Explore public opportunities
        </Link>
      </section>
    </aside>
  );
}
