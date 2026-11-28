import { ShowcaseViewerSkeleton } from "@/features/newsfeed/loading-skeletons";

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <ShowcaseViewerSkeleton />
    </main>
  );
}
