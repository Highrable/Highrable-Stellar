import { NewsfeedPage } from "@/features/newsfeed/feed";
export const metadata = { title: "Community Post | Highrable" };
export default async function Page({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <NewsfeedPage postId={postId} />;
}
