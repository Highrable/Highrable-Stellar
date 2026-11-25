"use client";

import { WalletStatusCard } from "@/core/wallet/components/wallet-status-card";
import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { ClientTrustActivitySection } from "@/features/client-profile/components/client-trust-activity-section";
import { ClientTrustProfileHeader } from "@/features/client-profile/components/client-trust-profile-header";
import { EditClientProfileForm } from "@/features/client-profile/components/edit-client-profile-form";
import { getClientTrustIndicator } from "@/features/client-profile/lib/client-trust";
import { PageLoadingState } from "@/features/common/components/layout/page-loading-state";
import { RouteEmptyState } from "@/features/common/components/layout/route-surface";
import { isSameWallet } from "@/features/marketplace/lib/wallet";
import { ModeSwitchCard } from "@/features/mode";
import { ProfessionalActivity } from "@/features/newsfeed/profile";
import { api } from "@repo/convex-client";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

import type { TClientTrustProfileResponse } from "@/features/client-profile/types";

export function ClientProfilePage({ walletAddress }: { readonly walletAddress: string }) {
  const decodedWalletAddress = useMemo(() => {
    try {
      return decodeURIComponent(walletAddress).trim();
    } catch {
      return walletAddress.trim();
    }
  }, [walletAddress]);
  const socialProfile = useQuery(
    api.newsfeed.queries.profile,
    decodedWalletAddress ? { walletAddress: decodedWalletAddress } : "skip",
  );
  const [isEditing, setIsEditing] = useState(false);
  const walletIdentity = useHighrableWalletIdentity();
  const hasWalletAddress = decodedWalletAddress.length > 0;
  const profileData = useQuery(
    api.profiles.getClientTrustProfile,
    hasWalletAddress ? { walletAddress: decodedWalletAddress } : "skip",
  ) as TClientTrustProfileResponse | null | undefined;

  if (!hasWalletAddress) {
    return (
      <RouteEmptyState
        title="Client profile not found"
        description="Check the wallet address and try again."
      />
    );
  }

  if (profileData === undefined) {
    return <PageLoadingState label="client profile" />;
  }

  if (profileData === null) {
    return (
      <RouteEmptyState
        title="Client profile not found"
        description="This wallet does not have a public client profile yet."
      />
    );
  }

  const {
    profile,
    stats,
    recentJobs,
    recentFundedEscrows,
    recentCompletedPayments,
    reportedJobsSummary,
  } = profileData;
  const canEdit = isSameWallet(walletIdentity.walletAddress, profile.walletAddress);
  const indicator = getClientTrustIndicator(stats);

  return (
    <div className="space-y-8">
      {socialProfile?.details?.coverUrl && (
        <img
          src={socialProfile.details.coverUrl}
          alt="Profile cover"
          className="h-40 w-full rounded-xl border border-border object-cover sm:h-56"
        />
      )}
      <ClientTrustProfileHeader
        profile={{
          ...profile,
          name: socialProfile?.author.name ?? profile.name,
          avatarUrl: socialProfile?.author.avatarUrl ?? profile.avatarUrl,
        }}
        indicator={indicator}
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

      {isEditing && canEdit ? (
        <EditClientProfileForm
          profile={{ ...profile, name: socialProfile?.author.name ?? profile.name }}
          onSaved={() => setIsEditing(false)}
          onCancel={() => setIsEditing(false)}
        />
      ) : null}

      <ClientTrustActivitySection
        stats={stats}
        recentJobs={recentJobs}
        recentFundedEscrows={recentFundedEscrows}
        recentCompletedPayments={recentCompletedPayments}
        {...(reportedJobsSummary ? { reportedJobsSummary } : {})}
      />
      <ProfessionalActivity walletAddress={decodedWalletAddress} />
    </div>
  );
}
