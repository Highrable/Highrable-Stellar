import { NewsfeedSearchPage } from "@/features/newsfeed/newsfeed-search-page";
import { Suspense } from "react";

export const metadata = { title: "Search Highrable | Newsfeed" };

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading search…</p>}>
      <NewsfeedSearchPage />
    </Suspense>
  );
}
