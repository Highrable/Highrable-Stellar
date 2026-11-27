"use client";

import { useHighrableWalletIdentity } from "@/core/wallet/hooks/use-highrable-wallet-identity";
import { api } from "@repo/convex-client";
import { Button as AppButton } from "@repo/ui/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import React from "react";

import type { FunctionReturnType } from "convex/server";

type TDeadlineNotification = FunctionReturnType<
  typeof api.deadlines.getNotificationsForWallet
>[number];

export interface IDeadlineNotificationsState {
  readonly walletAddress: string | null;
  readonly rows: TDeadlineNotification[];
  readonly unreadCount: number;
  readonly markAllRead: () => void;
}

function formatNotificationTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function useDeadlineNotifications(): IDeadlineNotificationsState {
  const walletIdentity = useHighrableWalletIdentity();
  const walletAddress = walletIdentity.walletAddress;
  const notifications = useQuery(
    api.deadlines.getNotificationsForWallet,
    walletAddress ? { walletAddress } : "skip",
  );
  const unreadCount = useQuery(
    api.deadlines.getUnreadNotificationCount,
    walletAddress ? { walletAddress } : "skip",
  );
  const markAllRead = useMutation(api.deadlines.markAllNotificationsRead);

  function handleMarkAllRead() {
    if (walletAddress) {
      void markAllRead({ recipientWallet: walletAddress });
    }
  }

  return {
    walletAddress,
    rows: notifications ?? [],
    unreadCount: unreadCount ?? 0,
    markAllRead: handleMarkAllRead,
  };
}

interface IDeadlineNotificationsPanelProps {
  readonly state: IDeadlineNotificationsState;
}

export function DeadlineNotificationsPanel({ state }: IDeadlineNotificationsPanelProps) {
  const { walletAddress, rows, unreadCount: unread, markAllRead } = state;

  // Reminders only take space when there is something to read.
  if (!walletAddress || rows.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="deadline-reminders-title"
      className="hr-card-surface min-w-0 overflow-hidden rounded-3xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2
            id="deadline-reminders-title"
            className="hr-text-primary font-sans text-base font-semibold"
          >
            Deadline reminders
          </h2>
          {unread > 0 ? (
            <span className="hr-mode-soft hr-mode-text rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase">
              {unread} unread
            </span>
          ) : null}
        </div>
        <AppButton
          type="button"
          variant="ghost"
          size="sm"
          disabled={unread === 0}
          onClick={markAllRead}
          className="hr-mode-text h-8 px-2 text-xs"
        >
          Mark all read
        </AppButton>
      </div>
      <ul className="divide-y divide-border/70">
        {rows.slice(0, 5).map((notification) => (
          <li key={notification._id} className="flex gap-3 px-5 py-4 sm:px-6">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                notification.readAt ? "bg-transparent" : "bg-(--mode-solid)"
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-x-3">
                <p
                  className={`hr-text-primary font-sans text-sm ${notification.readAt ? "" : "font-medium"}`}
                >
                  {notification.readAt ? null : <span className="sr-only">Unread: </span>}
                  {notification.title}
                </p>
                <time className="hr-text-muted font-sans text-xs">
                  {formatNotificationTime(notification.createdAt)}
                </time>
              </div>
              <p className="hr-text-secondary mt-0.5 font-sans text-sm leading-relaxed">
                {notification.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
