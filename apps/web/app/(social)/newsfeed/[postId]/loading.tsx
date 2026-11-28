import { PostListSkeleton } from "@/features/newsfeed/loading-skeletons";

export default function Loading() {
  return (
    <main className="hr-newsfeed-page mx-auto w-full max-w-5xl px-3 py-3 sm:px-5 sm:py-4">
      <PostListSkeleton label="Loading post" count={1} />
    </main>
  );
}
