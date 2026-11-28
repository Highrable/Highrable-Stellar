import { Skeleton } from "@repo/ui/components/ui/skeleton";

export function PostListSkeleton({
  label = "Loading posts",
  count = 2,
}: {
  label?: string;
  count?: number;
}) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="hr-card-surface space-y-4 rounded-2xl p-5 max-sm:p-7"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex justify-between gap-3 border-t pt-3">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MediaSkeleton({
  label,
  storyMode = false,
}: {
  label?: string;
  storyMode?: boolean;
}) {
  return (
    <div
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={storyMode ? "size-full" : "aspect-video min-h-36 w-full"}
    >
      <Skeleton
        className={
          storyMode ? "size-full rounded-none bg-white/15" : "size-full rounded-xl bg-muted"
        }
      />
    </div>
  );
}

export function ShowcaseTraySkeleton() {
  return (
    <section
      aria-label="Showcase"
      className="hr-card-surface hr-newsfeed-showcase rounded-2xl sm:px-5 sm:py-4"
    >
      <div role="status" aria-label="Loading showcases" className="space-y-3">
        <Skeleton aria-hidden="true" className="hidden h-4 w-24 sm:block" />
        <div aria-hidden="true" className="flex gap-3 overflow-hidden pb-1">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="flex w-22 shrink-0 flex-col items-center gap-2 p-2 sm:w-20 sm:p-1"
            >
              <Skeleton className="size-18 rounded-full sm:size-16" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ShowcaseViewerSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading showcase"
      className="mx-auto flex h-[min(70dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-black"
    >
      <div aria-hidden="true" className="flex items-center gap-3 p-4">
        <Skeleton className="size-10 rounded-full bg-white/15" />
        <Skeleton className="h-4 w-28 bg-white/15" />
      </div>
      <div aria-hidden="true" className="min-h-0 flex-1">
        <MediaSkeleton storyMode />
      </div>
      <Skeleton aria-hidden="true" className="m-4 h-4 w-2/3 bg-white/15" />
    </div>
  );
}

export function ThreadSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex gap-3">
      <Skeleton aria-hidden="true" className="size-9 shrink-0 rounded-full" />
      <div aria-hidden="true" className="flex-1 space-y-2 py-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
