import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = "text", width, height, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "animate-pulse bg-[var(--color-rule-faint)]",
        variant === "text" && "h-4 w-full rounded-sm",
        variant === "circular" && "h-10 w-10 rounded-full",
        variant === "rectangular" && "h-24 w-full rounded-[4px]",
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";
