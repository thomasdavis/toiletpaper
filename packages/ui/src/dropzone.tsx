"use client";

import { type DragEvent, type ReactNode, useCallback, useState } from "react";
import { cn } from "./cn";

interface DropzoneProps {
  onDrop: (files: File[]) => void;
  accept?: string;
  children?: ReactNode;
  className?: string;
}

export function Dropzone({ onDrop, accept, children, className }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

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
      const files = Array.from(e.dataTransfer.files);
      if (accept) {
        const accepted = files.filter((f) => f.type === accept);
        onDrop(accepted);
      } else {
        onDrop(files);
      }
    },
    [onDrop, accept],
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 p-8 text-stone-500 transition-colors",
        isDragging && "border-blue-500 bg-blue-50 text-blue-700",
        className,
      )}
    >
      {children ?? (
        <p className="text-sm">
          Drag &amp; drop a PDF here, or click to browse
        </p>
      )}
    </div>
  );
}
