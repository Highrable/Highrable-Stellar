"use client";

import { parseWalletAddressParam } from "@/core/seo";
import { WalletStatusCard } from "@/core/wallet/components/wallet-status-card";
import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { PageLoadingState } from "@/features/common/components/layout/page-loading-state";
import { RouteEmptyState } from "@/features/common/components/layout/route-surface";
import { isSameWallet } from "@/features/marketplace/lib/wallet";
import { ModeSwitchCard } from "@/features/mode";
import { ProfessionalActivity } from "@/features/newsfeed/profile";
import { EditFreelancerProfileForm } from "@/features/profile/components/edit-freelancer-profile-form";
import { FreelancerProfileHeader } from "@/features/profile/components/freelancer-profile-header";
import { FreelancerReputationSection } from "@/features/profile/components/freelancer-reputation-section";
import { api } from "@repo/convex-client";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/ui/responsive-dialog";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import type { TFreelancerProfileResponse } from "@/features/profile/types";

export function FreelancerProfilePage({ walletAddress }: { readonly walletAddress: string }) {
  const decodedWalletAddress = useMemo(() => {
    return parseWalletAddressParam(walletAddress);
  }, [walletAddress]);
  const socialProfile = useQuery(
    api.newsfeed.queries.profile,
    decodedWalletAddress ? { walletAddress: decodedWalletAddress } : "skip",
  );
  const [isEditing, setIsEditing] = useState(false);
  const walletIdentity = useHighrableWalletIdentity();
  const profileData = useQuery(
    api.profiles.getFreelancerProfile,
    decodedWalletAddress ? { walletAddress: decodedWalletAddress } : "skip",
  ) as TFreelancerProfileResponse | null | undefined;

  if (!decodedWalletAddress) {
    return (
      <RouteEmptyState
        title="Freelancer profile not found"
        description="Check the wallet address and try again."
      />
    );
  }

  if (profileData === undefined) {
    return <PageLoadingState label="freelancer profile" />;
  }

  if (profileData === null) {
    return (
      <RouteEmptyState
        title="Freelancer profile not found"
        description="This wallet does not have a public freelancer profile yet."
      />
    );
  }

  const { profile, stats, verifiedReviews, recentContracts } = profileData;
  const canEdit = isSameWallet(walletIdentity.walletAddress, profile.walletAddress);

  return (
    <div className="space-y-8">
      {socialProfile?.details?.coverUrl && (
        <img
          src={socialProfile.details.coverUrl}
          alt="Profile cover"
          className="h-40 w-full rounded-xl border border-border object-cover sm:h-56"
        />
      )}
      <FreelancerProfileHeader
        profile={{
          ...profile,
          name: socialProfile?.author.name ?? profile.name,
          avatarUrl: socialProfile?.author.avatarUrl ?? profile.avatarUrl,
        }}
        stats={stats}
        canEdit={canEdit}
        onEdit={() => setIsEditing(true)}
      />
      {socialProfile?.details?.headline && (
        <p className="text-lg">{socialProfile.details.headline}</p>
      )}

      {canEdit ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <WalletStatusCard />
          <ModeSwitchCard />
        </div>
      ) : null}

      <ResponsiveDialog open={isEditing && canEdit} onOpenChange={setIsEditing}>
        <ResponsiveDialogContent className="max-w-3xl">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="hr-text-primary text-lg sm:text-xl">
              Edit Profile
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="hr-text-secondary text-sm">
              Keep these fields aligned with your public onboarding identity.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <ResponsiveDialogBody>
            {canEdit ? (
              <EditFreelancerProfileForm
                profile={{ ...profile, name: socialProfile?.author.name ?? profile.name }}
                onSaved={() => setIsEditing(false)}
                onCancel={() => setIsEditing(false)}
              />
            ) : null}
          </ResponsiveDialogBody>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <FreelancerReputationSection
        stats={stats}
        reviews={verifiedReviews}
        contracts={recentContracts}
      />
      <ProfessionalActivity walletAddress={decodedWalletAddress} />
    </div>
  );
}
