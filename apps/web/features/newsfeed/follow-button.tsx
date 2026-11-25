"use client";

import { api, type TConvexId } from "@repo/convex-client";
import { Button } from "@repo/ui/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { UserPlus, UserRoundCheck } from "lucide-react";
import { useState } from "react";

import { useSocialSession } from "./session";

export function FollowButton({
  userId,
  initialFollowing,
  size = "sm",
  compact = false,
}: {
  userId: TConvexId<"users">;
  initialFollowing?: boolean;
  size?: "sm" | "default";
  compact?: boolean;
}) {
  const { token } = useSocialSession();
  const state = useQuery(api.newsfeed.queries.followState, {
    ...(token ? { token } : {}),
    userId,
  });
  const follow = useMutation(api.newsfeed.mutations.follow).withOptimisticUpdate(
    (localStore, args) => {
      const queryArgs = { token: args.token, userId: args.userId };
      const current = localStore.getQuery(api.newsfeed.queries.followState, queryArgs);
      if (current) {
        localStore.setQuery(api.newsfeed.queries.followState, queryArgs, {
          ...current,
          following: true,
        });
      }
    },
  );
  const unfollow = useMutation(api.newsfeed.mutations.unfollow).withOptimisticUpdate(
    (localStore, args) => {
      const queryArgs = { token: args.token, userId: args.userId };
      const current = localStore.getQuery(api.newsfeed.queries.followState, queryArgs);
      if (current) {
        localStore.setQuery(api.newsfeed.queries.followState, queryArgs, {
          ...current,
          following: false,
        });
      }
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const following = state?.following ?? initialFollowing ?? false;

  async function toggle() {
    if (!token || busy) return;
    const next = !following;
    setBusy(true);
    setError("");
    try {
      await (next ? follow({ token, userId }) : unfollow({ token, userId }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update follow status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size={compact ? "icon-sm" : size}
        variant={compact ? "ghost" : following ? "outline" : "default"}
        disabled={!token || busy}
        onClick={() => void toggle()}
        aria-pressed={following}
        aria-label={token ? (following ? "Unfollow" : "Follow") : "Sign in to follow"}
        title={
          compact ? (token ? (following ? "Unfollow" : "Follow") : "Sign in to follow") : undefined
        }
        className={
          compact
            ? "text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/40"
            : !following
              ? "hr-v2-button-primary"
              : undefined
        }
      >
        {following ? (
          <UserRoundCheck className={compact ? "size-4" : "mr-1.5 size-4"} />
        ) : (
          <UserPlus className={compact ? "size-4" : "mr-1.5 size-4"} />
        )}
        {!compact && (!token ? "Sign in to follow" : following ? "Following" : "Follow")}
      </Button>
      {error && (
        <span role="alert" className="max-w-36 text-right text-[11px] text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
