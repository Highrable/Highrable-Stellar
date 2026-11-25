"use client";

import { CloudUpload } from "lucide-react";
import React, { useRef, useState } from "react";

import type { DragEvent, ReactNode } from "react";

import { cn } from "../../lib/utils";

interface IFileUploadZoneProps {
  readonly onFiles: (files: File[]) => void;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly browseLabel?: string;
  readonly ariaLabel?: string;
  readonly accept?: string;
  readonly multiple?: boolean;
  readonly density?: "comfortable" | "compact";
  readonly showBrowseAction?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** Accessible file picker with a drag-and-drop surface and a native keyboard target. */
export function FileUploadZone({
  onFiles,
  title = "Drop files to upload",
  description,
  browseLabel = "Browse files",
  ariaLabel = "Upload files",
  accept,
  multiple = true,
  density = "comfortable",
  showBrowseAction = true,
  disabled = false,
  className,
}: IFileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isCompact = density === "compact";

  function handleFiles(files: FileList | null) {
    if (!files || disabled) return;
    onFiles(Array.from(files));
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-hidden="true"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => handleFiles(event.currentTarget.files)}
      />
      <button
        type="button"
        aria-label={ariaLabel}
        aria-disabled={disabled}
        disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          isCompact
            ? "grid w-full cursor-pointer place-items-center rounded-lg border border-dashed p-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            : "flex min-h-56 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-8",
          isDragging
            ? isCompact
              ? "border-highrable-orange-2 bg-orange-50"
              : "border-highrable-orange-3 bg-highrable-orange-1/10"
            : isCompact
              ? "border-border bg-muted/30 hover:border-highrable-orange-2/60 hover:bg-muted/50"
              : "border-border bg-card hover:border-highrable-orange-2/60 hover:bg-muted/30",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          className,
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center bg-highrable-orange-1/10 text-highrable-orange-3",
            isCompact ? "size-10 rounded-lg" : "size-16 rounded-2xl",
          )}
        >
          <CloudUpload className={isCompact ? "size-5" : "size-8"} aria-hidden="true" />
        </span>
        <span
          className={cn(
            "font-semibold text-foreground",
            isCompact ? "mt-3 font-mono text-sm" : "mt-4 font-sans text-base",
          )}
        >
          {title}
        </span>
        {description ? (
          <span
            className={cn(
              "text-muted-foreground",
              isCompact
                ? "mt-1 max-w-lg font-sans text-xs"
                : "mt-1 max-w-lg font-sans text-sm leading-relaxed",
            )}
          >
            {description}
          </span>
        ) : null}
        {showBrowseAction ? (
          <span className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-card px-5 font-sans text-sm font-semibold text-muted-foreground">
            {browseLabel}
          </span>
        ) : null}
      </button>
    </div>
  );
}
