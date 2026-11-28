import { PostListSkeleton } from "@/features/newsfeed/loading-skeletons";
import { NewsfeedSearchPage } from "@/features/newsfeed/newsfeed-search-page";
import { Suspense } from "react";

export const metadata = { title: "Search Highrable | Newsfeed" };

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-4xl p-4 sm:p-6">
          <PostListSkeleton label="Loading search" />
        </main>
      }
    >
      <NewsfeedSearchPage />
    </Suspense>
  );
}
