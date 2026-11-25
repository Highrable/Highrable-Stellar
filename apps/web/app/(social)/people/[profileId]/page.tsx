import { SocialProfessionalProfile } from "@/features/newsfeed/profile";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Professional Profile | Highrable",
  description: "Professional profile, portfolio and activity from the Highrable community.",
};

export default async function SocialProfileRoute({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <SocialProfessionalProfile profileId={profileId} />
    </main>
  );
}
