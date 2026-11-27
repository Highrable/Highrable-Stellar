"use client";

import { Button as AppButton } from "@repo/ui/components/ui/button";
import { Progress } from "@repo/ui/components/ui/progress";
import { cn } from "@repo/ui/lib/utils";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import React, { useId, useRef } from "react";

import type { KeyboardEvent, ReactNode } from "react";

export interface IFormStep {
  readonly id: string;
  /** Short tab title ("Details"). */
  readonly title: string;
  /** One plain-language sentence that says what this step is for. */
  readonly hint: string;
  /** Marks the step as needing attention (for example after a failed submit). */
  readonly hasError?: boolean;
}

interface IFormStepTabsProps {
  readonly steps: readonly IFormStep[];
  readonly activeIndex: number;
  readonly onSelect: (index: number) => void;
  readonly idPrefix?: string;
  readonly className?: string;
  /** Show the active step's title and hint under the tabs. */
  readonly showStepSummary?: boolean;
}

/** Numbered tab strip that doubles as a progress indicator. Steps stay clickable. */
export function FormStepTabs({
  steps,
  activeIndex,
  onSelect,
  idPrefix,
  className,
  showStepSummary = true,
}: IFormStepTabsProps) {
  const generatedId = useId();
  const prefix = idPrefix ?? generatedId;
  const active = steps[activeIndex];
  const tabListRef = useRef<HTMLDivElement>(null);
  const progress = steps.length > 0 ? ((activeIndex + 1) / steps.length) * 100 : 0;

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const tabList = tabListRef.current;
    const currentIndex = Number(event.currentTarget.dataset.stepIndex);
    if (!tabList || !Number.isInteger(currentIndex) || steps.length === 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % steps.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + steps.length) % steps.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = steps.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    tabList.querySelector<HTMLButtonElement>(`[data-step-index="${nextIndex}"]`)?.focus();
    onSelect(nextIndex);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="Form steps"
        className="grid gap-0"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          const isDone = index < activeIndex && !step.hasError;

          return (
            <div key={step.id} className="relative flex min-w-0 justify-center">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-4 right-[-50%] left-1/2 z-0 h-px",
                    isDone ? "bg-(--mode-solid)" : "bg-border",
                  )}
                />
              ) : null}
              <button
                type="button"
                role="tab"
                data-step-index={index}
                id={`${prefix}-tab-${step.id}`}
                aria-selected={isActive}
                aria-controls={`${prefix}-panel-${step.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onSelect(index)}
                onKeyDown={handleTabKeyDown}
                className="group relative z-10 flex min-w-0 flex-col items-center gap-2 rounded-lg px-1 pb-1 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    step.hasError
                      ? "border-red-600 bg-red-600 text-white"
                      : isActive || isDone
                        ? "border-(--mode-solid) bg-(--mode-solid) text-(--mode-on)"
                        : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "max-w-full truncate font-sans text-[11px] leading-tight font-semibold sm:text-xs",
                    isActive ? "text-foreground" : "text-muted-foreground",
                    step.hasError ? "text-red-700 dark:text-red-300" : "",
                  )}
                >
                  {step.title}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <Progress value={progress} aria-label="Form progress" className="h-1.5 bg-muted" />

      <p className="text-xs text-muted-foreground">
        Step {activeIndex + 1} of {steps.length}
      </p>

      {showStepSummary && active ? (
        <div>
          <p className="hr-text-primary font-sans text-base font-semibold">{active.title}</p>
          <p className="hr-text-secondary mt-0.5 font-sans text-sm">{active.hint}</p>
        </div>
      ) : null}
    </div>
  );
}

interface IFormStepPanelProps {
  readonly stepId: string;
  readonly isActive: boolean;
  readonly idPrefix: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * One tab's content. Inactive panels stay mounted (just hidden) so typed values, uploads and
 * validation state survive moving between steps.
 */
export function FormStepPanel({
  stepId,
  isActive,
  idPrefix,
  children,
  className,
}: IFormStepPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${stepId}`}
      aria-labelledby={`${idPrefix}-tab-${stepId}`}
      hidden={!isActive}
      className={cn("space-y-8", className)}
    >
      {children}
    </div>
  );
}

interface IFormStepNavProps {
  readonly activeIndex: number;
  readonly stepCount: number;
  readonly onBack: () => void;
  readonly onNext: () => void;
  /** Rendered in place of the Next button on the last step (usually the submit button). */
  readonly finalAction?: ReactNode;
  readonly nextLabel?: string;
  readonly nextDisabled?: boolean;
  readonly className?: string;
}

/** Back / Next buttons shared by every stepped form. */
export function FormStepNav({
  activeIndex,
  stepCount,
  onBack,
  onNext,
  finalAction,
  nextLabel = "Next step",
  nextDisabled,
  className,
}: IFormStepNavProps) {
  const isLast = activeIndex === stepCount - 1;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6",
        className,
      )}
    >
      <AppButton
        type="button"
        variant="outline"
        onClick={onBack}
        disabled={activeIndex === 0}
        className="gap-2 rounded-md px-4"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </AppButton>
      {isLast ? (
        finalAction
      ) : (
        <AppButton
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="hr-v2-button-primary gap-2 rounded-md px-4"
        >
          {nextLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </AppButton>
      )}
    </div>
  );
}
