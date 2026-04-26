import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const containerVariants = cva("mx-auto w-full px-4", {
  variants: {
    size: {
      sm: "max-w-2xl",
      md: "max-w-4xl",
      default: "max-w-6xl",
      lg: "max-w-7xl",
      full: "max-w-full",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export type ContainerProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof containerVariants>;

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(containerVariants({ size, className }))}
      {...props}
    />
  ),
);
Container.displayName = "Container";
