import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

export function SectionHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && (
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function ProfileRow({
  name,
  headline,
  avatarUrl,
  availability,
  action,
  href,
  className,
}: {
  name: string;
  headline?: string;
  avatarUrl?: string | null;
  availability?: string;
  action?: ReactNode;
  href?: string;
  className?: string;
}) {
  const content = (
    <>
      <Avatar className="size-10 shrink-0">
        <AvatarImage src={avatarUrl ?? undefined} alt="" />
        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {headline && (
          <span className="block truncate text-xs text-muted-foreground">{headline}</span>
        )}
        {availability && (
          <span className="mt-1 block truncate text-[11px] text-emerald-700 dark:text-emerald-300">
            {availability}
          </span>
        )}
      </span>
      {action && <span className="shrink-0">{action}</span>}
    </>
  );
  const classNameValue = cn("flex min-w-0 items-center gap-2.5", className);
  return href ? (
    <a href={href} className={classNameValue}>
      {content}
    </a>
  ) : (
    <div className={classNameValue}>{content}</div>
  );
}

export function TagChip({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  "aria-pressed"?: boolean;
  "aria-label"?: string;
  title?: string;
}) {
  const classes = cn(
    "inline-flex items-center rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/35 dark:text-orange-200",
    props.onClick &&
      "cursor-pointer transition-colors hover:bg-orange-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-orange-900/50",
    className,
  );
  return props.onClick ? (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  ) : (
    <span className={classes}>{children}</span>
  );
}
