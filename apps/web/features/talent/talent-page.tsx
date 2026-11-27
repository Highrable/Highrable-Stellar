import { ProductPageHero } from "@/features/common";
import { ModeGate } from "@/features/mode";
import { Button as AppButton } from "@repo/ui/components/ui/button";
import { Search, UsersRound } from "lucide-react";
import Link from "next/link";
import React from "react";

const plannedSignals = [
  "A public history of jobs they finished",
  "Clear stats about their past work",
  "Shortlists and invitations to apply",
] as const;

/** Placeholder for the future talent discovery surface. */
export function TalentPage() {
  return (
    <ModeGate allow="client" purpose="look for freelancers to hire">
      <div className="max-w-3xl space-y-6">
        <ProductPageHero
          title="Find freelancers"
          description="A searchable list of freelancers is not available yet. For now, the best way to hire is to post a job and review the people who apply."
          actions={
            <AppButton asChild className="hr-v2-button-primary h-9 rounded-md px-4">
              <Link href="/post-job">Post a job</Link>
            </AppButton>
          }
        />

        <section className="hr-card-surface space-y-5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="hr-mode-soft hr-mode-text flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <UsersRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="hr-text-primary text-base font-semibold">Talent discovery is next</h2>
              <p className="hr-text-secondary mt-1 text-sm">
                We will publish people here once their work history can be grounded in real,
                payment-backed Highrable jobs.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-border p-4">
            <h3 className="hr-text-primary flex items-center gap-2 text-sm font-semibold">
              <Search className="hr-text-muted h-4 w-4" aria-hidden="true" />
              What will be useful here
            </h3>
            <p className="hr-text-secondary text-sm">
              Freelancer listings will be based on real jobs finished and paid on Highrable:
            </p>
            <ul className="hr-text-secondary list-disc space-y-1 pl-5 text-sm">
              {plannedSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </ModeGate>
  );
}
