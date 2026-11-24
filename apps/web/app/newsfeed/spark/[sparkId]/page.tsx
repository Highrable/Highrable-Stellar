import { FeedBoundary } from "@/features/newsfeed/feed-boundary";
import { SocialSession } from "@/features/newsfeed/session";
import { SparkPermalink } from "@/features/newsfeed/stories";

export const metadata = { title: "Showcase | Highrable" };

export default async function SparkPage({ params }: { params: Promise<{ sparkId: string }> }) {
  const { sparkId } = await params;
  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <FeedBoundary>
        <SocialSession>
          <SparkPermalink sparkId={sparkId} />
        </SocialSession>
      </FeedBoundary>
    </div>
  );
}
