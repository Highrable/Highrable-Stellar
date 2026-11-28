import { FeedBoundary } from "@/features/newsfeed/feed-boundary";
import { SocialSession } from "@/features/newsfeed/session";

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <FeedBoundary>
      <SocialSession>{children}</SocialSession>
    </FeedBoundary>
  );
}
