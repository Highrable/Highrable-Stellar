"use client";

import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { useWallet } from "@/core/wallet/hooks/use-wallet";
import { fetchAdminSession, shouldRetryAdminRead } from "@/features/admin/lib/admin-api";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { AdminApiError } from "@/features/admin/lib/admin-api";
import type { IAdminSessionResponse } from "@/features/admin/types";

// Kept free of `@/features/common` imports so the sidebar can use it without a cycle.
export const ADMIN_QUERY_KEY = ["admin"] as const;

export function isMatchingWallet(verifiedWallet: string, connectedWallet: string): boolean {
  return verifiedWallet.trim().toUpperCase() === connectedWallet.trim().toUpperCase();
}

/** The verified admin session for the connected external wallet, shared through the query cache. */
export function useAdminSessionQuery({ enabled = true }: { readonly enabled?: boolean } = {}) {
  const walletIdentity = useHighrableWalletIdentity();
  const { authSession, walletState } = useWallet();

  const externalWalletAddress = walletState.isConnected ? walletState.walletAddress : null;
  const shouldCheckSession =
    walletIdentity.activeWalletMode === "external_wallet" &&
    walletState.isConnected &&
    externalWalletAddress !== null;
  const sessionQueryKey = useMemo(
    () => [...ADMIN_QUERY_KEY, "session", externalWalletAddress, authSession?.expiresAt ?? null],
    [authSession?.expiresAt, externalWalletAddress],
  );

  const sessionQuery = useQuery<IAdminSessionResponse, AdminApiError>({
    queryKey: sessionQueryKey,
    queryFn: ({ signal }) => fetchAdminSession({ signal }),
    enabled: enabled && shouldCheckSession,
    staleTime: 0,
    retry: shouldRetryAdminRead,
  });

  return { sessionQuery, sessionQueryKey, externalWalletAddress, shouldCheckSession };
}

/**
 * True only when the server has verified the connected wallet as the platform owner.
 * Navigation uses this to hide owner pages; the pages themselves still enforce access.
 */
export function useIsVerifiedAdminOwner({ enabled = true }: { readonly enabled?: boolean } = {}) {
  const { sessionQuery, externalWalletAddress, shouldCheckSession } = useAdminSessionQuery({
    enabled,
  });

  return (
    enabled &&
    shouldCheckSession &&
    sessionQuery.isSuccess &&
    externalWalletAddress !== null &&
    isMatchingWallet(sessionQuery.data.adminWallet, externalWalletAddress) &&
    sessionQuery.data.isOwner
  );
}
