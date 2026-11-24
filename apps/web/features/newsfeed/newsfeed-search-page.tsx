"use client";

import { api, type TConvexId } from "@repo/convex-client";
import { SectionHeader, TagChip } from "@repo/ui/components/highrable/social-primitives";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/ui/avatar";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { usePaginatedQuery, useQuery } from "convex/react";
import { BriefcaseBusiness, Search, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { FunctionReturnType } from "convex/server";

import { MediaItem, PostCard } from "./feed";
import { FeedBoundary } from "./feed-boundary";
import { FollowButton } from "./follow-button";
import { NewsfeedSidebar } from "./newsfeed-sidebar";
import { SocialSession } from "./session";

type Category = "all" | "people" | "opportunities" | "posts" | "sparks";
type AllResults = FunctionReturnType<typeof api.newsfeed.queries.searchAll>;
type SearchPost = NonNullable<FunctionReturnType<typeof api.newsfeed.queries.post>>;

const categoryLabels: { id: Category; label: string; icon: typeof Users }[] = [
  { id: "all", label: "All results", icon: Search },
  { id: "people", label: "People", icon: Users },
  { id: "opportunities", label: "Opportunities", icon: BriefcaseBusiness },
  { id: "posts", label: "Posts", icon: Search },
  { id: "sparks", label: "Showcase", icon: Sparkles },
];

function SearchResults({ term, tag }: { term: string; tag: string }) {
  const [category, setCategory] = useState<Category>("all");
  const all = useQuery(
    api.newsfeed.queries.searchAll,
    term.length >= 2 ? { term, ...(tag ? { tag } : {}) } : "skip",
  );
  const paginated = usePaginatedQuery(
    api.newsfeed.queries.searchCategory,
    term.length >= 2 && category !== "all" ? { term, category, ...(tag ? { tag } : {}) } : "skip",
    { initialNumItems: 8 },
  );

  const categoryItems = paginated.results as unknown[];
  const allItems = all as AllResults | undefined;

  return (
    <section className="min-w-0 space-y-4">
      <div
        className="flex flex-wrap gap-2 rounded-2xl border bg-background p-2"
        role="group"
        aria-label="Search categories"
      >
        {categoryLabels.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={category === id ? "default" : "ghost"}
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
            className={
              category === id
                ? "bg-orange-600 text-white hover:bg-orange-700"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            }
          >
            <Icon aria-hidden="true" className="mr-1.5 size-3.5" />
            {label}
          </Button>
        ))}
      </div>

      {term.length < 2 ? (
        <p className="rounded-xl border bg-background p-5 text-sm text-muted-foreground">
          Enter at least two characters to search.
        </p>
      ) : category === "all" ? (
        all === undefined ? (
          <p
            role="status"
            className="rounded-xl border bg-background p-5 text-sm text-muted-foreground"
          >
            Searching Highrable…
          </p>
        ) : (
          <div className="space-y-5">
            {allItems?.people.length ? <PeopleSection items={allItems.people} /> : null}
            {allItems?.opportunities.length ? (
              <OpportunitySection items={allItems.opportunities} />
            ) : null}
            {allItems?.sparks.length ? <SparkSection items={allItems.sparks} /> : null}
            {allItems?.posts.length ? <PostSection items={allItems.posts} /> : null}
            {allItems && Object.values(allItems).every((items) => items.length === 0) ? (
              <p className="rounded-xl border bg-background p-5 text-sm text-muted-foreground">
                No public results found.
              </p>
            ) : (
              <TrendingTagsSection />
            )}
          </div>
        )
      ) : paginated.status === "LoadingFirstPage" ? (
        <p
          role="status"
          className="rounded-xl border bg-background p-5 text-sm text-muted-foreground"
        >
          Searching {categoryLabels.find((item) => item.id === category)?.label.toLowerCase()}…
        </p>
      ) : categoryItems.length === 0 ? (
        <div className="space-y-3">
          <p className="rounded-xl border bg-background p-5 text-sm text-muted-foreground">
            No public results found on this page.
          </p>
          {paginated.status === "CanLoadMore" && (
            <Button type="button" variant="outline" onClick={() => paginated.loadMore(8)}>
              Load more results
            </Button>
          )}
          {paginated.status === "LoadingMore" && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading more results…
            </p>
          )}
        </div>
      ) : (
        <>
          {category === "people" && (
            <PeopleSection
              items={categoryItems as NonNullable<AllResults>["people"]}
              title="People"
            />
          )}
          {category === "opportunities" && (
            <OpportunitySection
              items={categoryItems as NonNullable<AllResults>["opportunities"]}
              title="Public opportunities"
            />
          )}
          {category === "sparks" && (
            <SparkSection
              items={categoryItems as NonNullable<AllResults>["sparks"]}
              title="Showcases"
            />
          )}
          {category === "posts" && (
            <PostSection items={categoryItems as SearchPost[]} title="Published posts" />
          )}
          {paginated.status === "CanLoadMore" && (
            <Button type="button" variant="outline" onClick={() => paginated.loadMore(8)}>
              Load more results
            </Button>
          )}
          {paginated.status === "LoadingMore" && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading more results…
            </p>
          )}
        </>
      )}
    </section>
  );
}

function PeopleSection({
  items,
  title = "People & collaborators",
}: {
  items: AllResults["people"];
  title?: string;
}) {
  return (
    <section className="hr-card-surface space-y-3 rounded-2xl p-4" aria-label={title}>
      <SectionHeader title={title} icon={<Users aria-hidden="true" className="size-4" />} />
      {items.length ? (
        <ul className="space-y-2">
          {items.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-lg border bg-slate-50 p-3 dark:bg-slate-900"
            >
              <Link
                href={`/people/${person.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar className="size-11 shrink-0">
                  <AvatarImage src={person.avatarUrl ?? undefined} alt="" />
                  <AvatarFallback>{person.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{person.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {person.headline || "Highrable member"}
                  </span>
                  {person.availability && (
                    <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-300">
                      {person.availability}
                    </span>
                  )}
                </span>
              </Link>
              <FollowButton userId={person.id as TConvexId<"users">} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No people found.</p>
      )}
    </section>
  );
}

function OpportunitySection({
  items,
  title = "Public opportunities",
}: {
  items: AllResults["opportunities"];
  title?: string;
}) {
  return (
    <section className="hr-card-surface space-y-3 rounded-2xl p-4" aria-label={title}>
      <SectionHeader
        title={title}
        icon={<BriefcaseBusiness aria-hidden="true" className="size-4" />}
        action={
          <Link
            href="/marketplace"
            className="text-xs font-medium text-orange-700 hover:underline dark:text-orange-300"
          >
            Marketplace
          </Link>
        }
      />
      {items.length ? (
        <ul className="space-y-2">
          {items.map((job) => (
            <li key={job.id} className="rounded-lg border bg-slate-50 p-3 dark:bg-slate-900">
              <Link
                href={`/marketplace/jobs/${job.id}`}
                className="font-semibold hover:text-orange-700 hover:underline"
              >
                {job.title}
              </Link>
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{job.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Public opportunity · {job.budget} {job.asset}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No open public opportunities found.</p>
      )}
    </section>
  );
}

function SparkSection({
  items,
  title = "Showcases",
}: {
  items: AllResults["sparks"];
  title?: string;
}) {
  return (
    <section className="hr-card-surface space-y-3 rounded-2xl p-4" aria-label={title}>
      <SectionHeader title={title} icon={<Sparkles aria-hidden="true" className="size-4" />} />
      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((spark) => (
            <li
              key={spark.id}
              className="overflow-hidden rounded-lg border bg-white dark:bg-slate-950"
            >
              {spark.media[0] ? (
                <MediaItem media={spark.media[0]} auto={spark.media[0].mime.startsWith("image/")} />
              ) : null}
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <Avatar className="size-8">
                    <AvatarImage src={spark.author.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback>{spark.author.name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{spark.author.name}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm">
                  {spark.note || "Shared work in progress"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {spark.tags.map((tag) => (
                    <Link key={tag} href={`/newsfeed/search?tag=${encodeURIComponent(tag)}`}>
                      <TagChip>#{tag}</TagChip>
                    </Link>
                  ))}
                </div>
                <Link
                  href={`/newsfeed/spark/${spark.id}`}
                  className="mt-3 inline-flex text-sm font-medium text-orange-700 hover:underline dark:text-orange-300"
                >
                  Open showcase
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No showcases found.</p>
      )}
    </section>
  );
}

function TrendingTagsSection() {
  const tags = useQuery(api.newsfeed.queries.trendingTags, {});
  if (tags === undefined || tags.length === 0) return null;
  return (
    <section className="hr-card-surface space-y-3 rounded-2xl p-4" aria-label="Trending craft tags">
      <SectionHeader
        title="Trending craft tags"
        description="Popular topics from published work"
        icon={<Sparkles aria-hidden="true" className="size-4" />}
      />
      <div className="flex flex-wrap gap-2">
        {tags.map(({ tag }) => (
          <Link
            key={tag}
            href={`/newsfeed/search?tag=${encodeURIComponent(tag)}`}
            className="inline-flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900"
          >
            <span className="font-medium text-orange-600">#</span> {tag}
          </Link>
        ))}
      </div>
    </section>
  );
}

function PostSection({
  items,
  title = "Published posts",
}: {
  items: SearchPost[];
  title?: string;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <SectionHeader title={title} icon={<Search aria-hidden="true" className="size-4" />} />
      {items.length ? (
        items.map((post) => <PostCard key={post._id} post={post} />)
      ) : (
        <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          No published posts found.
        </p>
      )}
    </section>
  );
}

export function NewsfeedSearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTag = searchParams.get("tag") ?? "";
  const [term, setTerm] = useState(searchParams.get("q") ?? initialTag);
  const [tag, setTag] = useState(initialTag);
  return (
    <FeedBoundary>
      <SocialSession>
        <div className="mx-auto w-full max-w-7xl space-y-4 px-3 py-3 sm:px-5 sm:py-4">
          <header className="space-y-3">
            <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
              <ol className="flex items-center gap-2">
                <li>Highrable</li>
                <li aria-hidden="true">›</li>
                <li>
                  <Link href="/newsfeed" className="hover:text-orange-600">
                    Newsfeed
                  </Link>
                </li>
                <li aria-hidden="true">›</li>
                <li className="font-medium text-slate-900 dark:text-slate-100">Search Results</li>
              </ol>
            </nav>
            <form
              className="flex gap-2 rounded-xl border bg-background p-2 shadow-sm"
              onSubmit={(event) => {
                event.preventDefault();
                const query = term.trim();
                if (query.length < 2) return;
                const params = new URLSearchParams({ q: query });
                if (tag) params.set("tag", tag);
                router.replace(`/newsfeed/search?${params.toString()}`);
              }}
            >
              <Input
                aria-label="Search Highrable"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search people, posts, showcases, opportunities"
                className="h-10 min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button
                type="submit"
                className="rounded-md bg-orange-600 text-white hover:bg-orange-700"
              >
                <Search aria-hidden="true" className="mr-2 size-4" />
                Search
              </Button>
            </form>
            {tag && (
              <div className="flex items-center gap-2 text-sm">
                Tag filter <TagChip>#{tag}</TagChip>
                <button
                  type="button"
                  className="text-muted-foreground underline"
                  onClick={() => {
                    setTag("");
                    router.replace(`/newsfeed/search?q=${encodeURIComponent(term)}`);
                  }}
                >
                  Clear
                </button>
              </div>
            )}
          </header>
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(15rem,1fr)]">
            <SearchResults
              key={`${searchParams.get("q") ?? ""}:${initialTag}`}
              term={term.trim()}
              tag={tag}
            />
            <NewsfeedSidebar />
          </div>
        </div>
      </SocialSession>
    </FeedBoundary>
  );
}
