import { ResponsiveDialogClose } from "@repo/ui/responsive-dialog";
import { X } from "lucide-react";

import type { ReactNode } from "react";

type ComposerSectionLabelProps = {
  children: ReactNode;
};

export function ComposerSectionLabel({ children }: ComposerSectionLabelProps) {
  return (
    <span className="block text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </span>
  );
}

export function MobileDialogClose() {
  return (
    <ResponsiveDialogClose className="absolute top-3 right-3 z-10 inline-flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border/70 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:hidden">
      <X aria-hidden="true" className="size-5" />
      <span className="sr-only">Close dialog</span>
    </ResponsiveDialogClose>
  );
}

type SuggestedTagChipsProps = {
  tags: string[];
  selectedTags: string[];
  disabled: boolean;
  onToggle: (tag: string) => void;
};

export function SuggestedTagChips({
  tags,
  selectedTags,
  disabled,
  onToggle,
}: SuggestedTagChipsProps) {
  if (tags.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Popular tags
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Popular tags">
        {tags.map((tag) => {
          const selected = selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase());
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onToggle(tag)}
              className={`min-h-9 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "bg-primary/10 text-primary hover:bg-primary/15"
                  : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
              }`}
            >
              #{tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
