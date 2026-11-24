import { cn } from "@repo/ui/lib/utils";
import React from "react";

import type { ReactNode } from "react";

interface IProductPageHeroProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Small context line above the title, such as a case number or a back link. */
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}

/** Page title row for product routes: title and short description, with actions on the right. */
export function ProductPageHero({
  title,
  description,
  meta,
  actions,
  className,
}: IProductPageHeroProps) {
  return (
    <header
      className={cn(
        "hr-product-page-hero flex flex-col gap-5 border-b border-border/80 pb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div className="min-w-0 space-y-3">
        {meta ? <div className="hr-text-accent font-mono text-xs font-medium">{meta}</div> : null}
        <h1 className="hr-text-primary font-sans text-4xl leading-[1.08] font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="hr-text-secondary max-w-3xl text-base leading-relaxed sm:text-lg">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </header>
  );
}
