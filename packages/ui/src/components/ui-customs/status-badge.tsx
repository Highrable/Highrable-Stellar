import { cn } from "../../lib/utils";
import { Badge } from "./badge";

interface StatusBadgeProps {
  status: string;
  activeValue?: string;
  tone?: "neutral" | "info" | "warning" | "success" | "danger";
  className?: string;
}

const TONE_VARIANTS = {
  neutral: "gray",
  info: "info",
  warning: "warning",
  success: "success",
  danger: "error",
} as const;

export function StatusBadge({ status, activeValue = "ACTIVE", tone, className }: StatusBadgeProps) {
  const isActive = status === activeValue;
  const variant = tone ? TONE_VARIANTS[tone] : isActive ? "success" : "gray";

  return (
    <Badge
      variant={variant}
      className={cn("px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase", className)}
    >
      {status}
    </Badge>
  );
}
