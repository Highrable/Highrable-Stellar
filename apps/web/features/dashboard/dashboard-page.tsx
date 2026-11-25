"use client";

import { WalletRequiredNotice } from "@/core/wallet/components/wallet-required-notice";
import { AdminDashboardEntry } from "@/features/admin";
import { ProductPageHero, RouteCallout, StatCard } from "@/features/common";
import { AppliedJobsSection } from "@/features/dashboard/components/applied-jobs-section";
import { OngoingJobsSection } from "@/features/dashboard/components/ongoing-jobs-section";
import { PostedJobsSection } from "@/features/dashboard/components/posted-jobs-section";
import { RecentPayoutsList } from "@/features/dashboard/components/recent-payouts-list";
import { RegistryRegistrationCard } from "@/features/dashboard/components/registry-registration-card";
import { useDashboardRole } from "@/features/dashboard/hooks/use-dashboard-role";
import { useFreelancerDashboard } from "@/features/dashboard/hooks/use-freelancer-dashboard";
import { formatAmount, formatAsset } from "@/features/dashboard/lib/format";
import { DeadlineNotificationsPanel, useDeadlineNotifications } from "@/features/deadlines";
import { useAppMode } from "@/features/mode";
import { useRequireOnboarding } from "@/features/onboarding";
import { Button as AppButton } from "@repo/ui/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import React from "react";

import type { TAssetAmount, TDashboardMode } from "@/features/dashboard/types";

const WORK_TABS = [
  ["applied", "Applications"],
  ["progress", "In progress"],
  ["payments", "Payments received"],
] as const;

const DASHBOARD_COPY: Record<
  TDashboardMode,
  { title: string; description: string; action: { href: string; label: string } }
> = {
  client: {
    title: "My jobs",
    description: "Jobs you posted, who applied, and where each payment stands.",
    action: { href: "/post-job", label: "Post a job" },
  },
  freelancer: {
    title: "My work",
    description: "Your earnings, money on hold, and the jobs you are working on.",
    action: { href: "/marketplace", label: "Find work" },
  },
};

function formatAssetAmountList(rows: TAssetAmount[]): string {
  if (rows.length === 0) return "0";
  return rows.map((r) => `${formatAmount(r.amount)} ${formatAsset(r.asset)}`).join(" + ");
}

function SummarySkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      aria-hidden="true"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="hr-card-surface space-y-3 rounded-3xl p-5 sm:p-6">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-7 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Summarizes wallet-specific escrow activity for the connected freelancer using Convex data. */
export function DashboardPage() {
  const { summary, isLoading, isConnected, isTestnet, isFunded } = useFreelancerDashboard();
  const onboardingGuard = useRequireOnboarding();
  const { role, isLoading: isRoleLoading } = useDashboardRole();
  const { mode: selectedMode, isReady: isModeReady } = useAppMode();
  const deadlineNotifications = useDeadlineNotifications();

  const showFreelancerSections = !isRoleLoading && isModeReady && selectedMode === "freelancer";
  const showClientSections = !isRoleLoading && isModeReady && selectedMode === "client";
  const hasDeadlineNotifications =
    Boolean(deadlineNotifications.walletAddress) && deadlineNotifications.rows.length > 0;
  const copy = DASHBOARD_COPY[selectedMode];

  if (!isConnected) {
    return (
      <WalletRequiredNotice
        title="Your Dashboard"
        description="Connect your wallet to see your jobs and payments."
      />
    );
  }

  if (onboardingGuard.isCheckingOnboarding) {
    return <p className="font-sans text-sm text-muted-foreground">Checking onboarding…</p>;
  }

  if (!isRoleLoading && role === "admin") {
    return <AdminDashboardEntry />;
  }

  return (
    <div className="space-y-8">
      <ProductPageHero
        title={copy.title}
        description={copy.description}
        actions={
          <AppButton asChild className="hr-v2-button-primary h-11 rounded-xl px-6 font-semibold">
            <Link href={copy.action.href}>{copy.action.label}</Link>
          </AppButton>
        }
      />

      {!isRoleLoading && role !== "admin" && onboardingGuard.isOnboardingComplete ? (
        <RegistryRegistrationCard />
      ) : null}

      {isTestnet && isFunded === false ? (
        <RouteCallout tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
          Your practice account has no test money yet. You can look around, but you need free test
          XLM before you can make or receive payments.
        </RouteCallout>
      ) : null}

      {!showFreelancerSections && !showClientSections ? (
        <DeadlineNotificationsPanel state={deadlineNotifications} />
      ) : null}

      {showFreelancerSections && isLoading ? <SummarySkeleton /> : null}

      {showFreelancerSections && !isLoading && summary ? (
        <section
          aria-label="Earnings summary"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        >
          <StatCard
            className="hr-card-surface rounded-3xl p-5 sm:p-6"
            label="Total earned"
            value={formatAssetAmountList(summary.totalEarnedByAsset)}
            description="Paid for finished jobs"
          />
          <StatCard
            className="hr-card-surface rounded-3xl p-5 sm:p-6"
            label="On hold for you"
            value={formatAssetAmountList(summary.pendingEscrowByAsset)}
            description="Set aside by clients"
          />
          <StatCard
            className="hr-card-surface rounded-3xl p-5 sm:p-6"
            label="In progress"
            value={summary.activeJobs.toString()}
            description="Funded or handed in"
          />
          <StatCard
            className="hr-card-surface rounded-3xl p-5 sm:p-6"
            label="Awaiting funding"
            value={summary.awaitingFunding.toString()}
            description="Picked, not yet funded"
          />
          <StatCard
            className="hr-card-surface rounded-3xl p-5 sm:p-6"
            label="Finished"
            value={summary.completedJobs.toString()}
            description="Jobs you were paid for"
          />
        </section>
      ) : null}

      {showFreelancerSections ? (
        <div
          className={`grid grid-cols-1 items-start gap-6 ${
            hasDeadlineNotifications ? "lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.9fr)]" : ""
          }`}
        >
          {hasDeadlineNotifications ? (
            <DeadlineNotificationsPanel state={deadlineNotifications} />
          ) : null}
          <section
            aria-label="Your work"
            className="hr-card-surface min-w-0 rounded-3xl p-4 sm:p-6"
          >
            <Tabs defaultValue="applied" className="gap-5">
              <TabsList
                variant="line"
                className="h-auto w-full justify-start gap-1 border-b border-border/70 px-0 pb-0 sm:gap-3"
              >
                {WORK_TABS.map(([value, label]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="h-auto min-w-0 rounded-none px-1.5 py-3 text-center text-xs leading-tight !whitespace-normal data-[state=active]:font-semibold data-[state=active]:text-(--mode-text) data-[state=active]:after:bg-(--mode-solid) sm:flex-none sm:px-3 sm:text-sm"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="applied" className="min-h-64">
                <AppliedJobsSection />
              </TabsContent>
              <TabsContent value="progress" className="min-h-64">
                <OngoingJobsSection />
              </TabsContent>
              <TabsContent value="payments" className="min-h-64">
                <RecentPayoutsList payouts={summary?.recentPayouts ?? []} />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      ) : null}

      {showClientSections ? (
        <div
          className={`grid grid-cols-1 items-start gap-6 ${
            hasDeadlineNotifications ? "lg:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.7fr)]" : ""
          }`}
        >
          {hasDeadlineNotifications ? (
            <DeadlineNotificationsPanel state={deadlineNotifications} />
          ) : null}
          <PostedJobsSection />
        </div>
      ) : null}
    </div>
  );
}
