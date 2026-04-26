"use client";

import { type DragEvent, type ChangeEvent, useCallback, useRef, useState } from "react";
import { cn } from "./cn";

export interface FileUploadProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  className?: string;
  disabled?: boolean;
}

export function FileUpload({
  onFiles,
  accept,
  multiple = false,
  label = "Drag & drop files here, or click to browse",
  hint,
  className,
  disabled = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      onFiles(files);
    },
    [onFiles, disabled],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        onFiles(Array.from(e.target.files));
      }
    },
    [onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!disabled) inputRef.current?.click();
        }
      }}
      className={cn(
        "flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-[4px] border-2 border-dashed p-6 text-center transition-colors",
        isDragging
          ? "border-[var(--color-primary)] bg-[var(--color-primary-faint)]"
          : "border-[var(--color-rule)] bg-[var(--color-paper)] hover:border-[var(--color-rule-strong)]",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <svg
        className={cn(
          "mb-3 h-8 w-8",
          isDragging ? "text-[var(--color-primary)]" : "text-[var(--color-ink-faint)]",
        )}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3 3 0 013.438 4.397A4.5 4.5 0 0118 19.5H6.75z"
        />
      </svg>
      <span className="font-[var(--font-sans)] text-sm text-[var(--color-ink-muted)]">
        {label}
      </span>
      {hint && (
        <span className="mt-1 font-[var(--font-sans)] text-xs text-[var(--color-ink-faint)]">
          {hint}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
}
