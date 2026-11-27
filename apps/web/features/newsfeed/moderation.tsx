"use client";
import { ProductPageHero } from "@/features/common/components/layout/product-page-hero";
import { api } from "@repo/convex-client";
import { Button } from "@repo/ui/components/ui/button";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useState } from "react";

import { FeedBoundary } from "./feed-boundary";
import { SocialSessionStatus, useSocialSession } from "./session";
function Queue() {
  const { token } = useSocialSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { results, status, loadMore } = usePaginatedQuery(
    api.newsfeed.queries.moderationQueue,
    token ? { token } : "skip",
    { initialNumItems: 20 },
  );
  const moderate = useMutation(api.newsfeed.mutations.moderate);
  if (!token) return <p>Verify the configured administrator wallet to review reports.</p>;
  return (
    <section className="space-y-4">
      {results.map((report) => (
        <article key={report._id} className="hr-card-surface space-y-3 p-4">
          <p>Reported by {report.reporter.name}</p>
          <p className="whitespace-pre-wrap">{report.reason}</p>
          <p>Status: {report.target?.status ?? "unavailable"}</p>
          {report.target && "body" in report.target && (
            <p className="whitespace-pre-wrap">{report.target.body}</p>
          )}
          <p className="text-sm break-all">Content ID: {report.postId ?? report.commentId}</p>
          {report.target && ["published", "hidden"].includes(report.target.status) && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const reason = window.prompt("Moderation reason (recorded in the audit log)");
                if (!reason?.trim()) return;
                setBusy(true);
                setError("");
                try {
                  await moderate({
                    token,
                    postId: report.postId,
                    commentId: report.commentId,
                    hidden: report.target!.status !== "hidden",
                    reason,
                  });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Moderation failed.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {report.target.status === "hidden" ? "Restore" : "Hide"}
            </Button>
          )}
        </article>
      ))}
      {status === "CanLoadMore" && <button onClick={() => loadMore(20)}>Load more reports</button>}
      {status === "Exhausted" && results.length === 0 && <p>No reports.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function ModerationPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ProductPageHero
        title="Newsfeed moderation"
        description="Review reported community content and record the existing moderation decision."
        meta="Administrator tools"
      />
      <FeedBoundary>
        <SocialSessionStatus />
        <Queue />
      </FeedBoundary>
    </div>
  );
}
