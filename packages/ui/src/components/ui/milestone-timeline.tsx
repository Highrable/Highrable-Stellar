import { AlertCircle, Check, Circle, LoaderCircle, LockKeyhole } from "lucide-react";
import React from "react";

import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export type TMilestoneTimelineState = "complete" | "active" | "pending" | "attention" | "locked";

export interface IMilestoneTimelineItem {
  readonly id: string;
  readonly state: TMilestoneTimelineState;
  readonly content: ReactNode;
}

interface IMilestoneTimelineProps {
  readonly items: readonly IMilestoneTimelineItem[];
  readonly ariaLabel?: string;
  readonly className?: string;
}

const MARKER_CLASSES: Record<TMilestoneTimelineState, string> = {
  complete: "bg-emerald-500 text-white",
  active: "bg-highrable-orange-2 text-white",
  pending: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300",
  attention: "bg-red-500 text-white",
  locked: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300",
};

function TimelineMarker({ state }: { readonly state: TMilestoneTimelineState }) {
  const iconClassName = "size-5";

  if (state === "complete") return <Check className={iconClassName} aria-hidden="true" />;
  if (state === "active") {
    return (
      <LoaderCircle className={cn(iconClassName, "motion-safe:animate-spin")} aria-hidden="true" />
    );
  }
  if (state === "attention") return <AlertCircle className={iconClassName} aria-hidden="true" />;
  if (state === "locked") return <LockKeyhole className={iconClassName} aria-hidden="true" />;
  return <Circle className={iconClassName} aria-hidden="true" />;
}

/** Timeline rail for ordered project milestones. State meaning stays with the caller. */
export function MilestoneTimeline({
  items,
  ariaLabel = "Project milestones",
  className,
}: IMilestoneTimelineProps) {
  if (items.length === 0) return null;

  return (
    <ol aria-label={ariaLabel} className={cn("hr-milestone-timeline space-y-4", className)}>
      {items.map((item, index) => (
        <li
          key={item.id}
          className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3 sm:gap-4"
        >
          {index < items.length - 1 ? (
            <span
              className="absolute top-10 bottom-[-1rem] left-5 border-l border-dashed border-border"
              aria-hidden="true"
            />
          ) : null}
          <span
            className={cn(
              "relative z-10 flex size-10 items-center justify-center rounded-2xl",
              MARKER_CLASSES[item.state],
            )}
            aria-hidden="true"
          >
            <TimelineMarker state={item.state} />
          </span>
          <div className="min-w-0">{item.content}</div>
        </li>
      ))}
    </ol>
  );
}
