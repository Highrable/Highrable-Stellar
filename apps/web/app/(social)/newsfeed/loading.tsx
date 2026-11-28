import { PostListSkeleton, ShowcaseTraySkeleton } from "@/features/newsfeed/loading-skeletons";

export default function Loading() {
  return (
    <main className="hr-newsfeed-page mx-auto w-full max-w-7xl space-y-4 px-3 py-3 sm:px-5 sm:py-4">
      <ShowcaseTraySkeleton />
      <PostListSkeleton />
    </main>
  );
}
