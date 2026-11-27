import { PageLoadingState } from "@/features/common/components/layout/page-loading-state";
import { NewsfeedSearchPage } from "@/features/newsfeed/newsfeed-search-page";
import { Suspense } from "react";

export const metadata = { title: "Search Highrable | Newsfeed" };

export default function SearchPage() {
  return (
    <Suspense fallback={<PageLoadingState label="search" />}>
      <NewsfeedSearchPage />
    </Suspense>
  );
}
