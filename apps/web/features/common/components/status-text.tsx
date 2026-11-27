import { cn } from "@repo/ui/lib/utils";
import React from "react";

import type { ReactNode } from "react";

export type TStatusTone = "neutral" | "info" | "warning" | "success" | "danger";

const TONE_CLASSES: Record<TStatusTone, string> = {
  neutral:
    "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  danger:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300",
};

interface IStatusTextProps {
  readonly tone?: TStatusTone;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Compact semantic badge; each state is conveyed by both its label and its colour. */
export function StatusText({ tone = "neutral", children, className }: IStatusTextProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2.5 py-1 font-sans text-[11px] leading-none font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
