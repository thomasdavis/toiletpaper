import { type HTMLAttributes, forwardRef, type ElementType } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const headingVariants = cva(
  "font-[var(--font-serif)] font-bold text-[var(--color-ink)] leading-tight",
  {
    variants: {
      level: {
        1: "text-[48px] tracking-[-0.02em]",
        2: "text-[36px] tracking-[-0.02em]",
        3: "text-[30px] tracking-[-0.01em]",
        4: "text-[24px] tracking-[-0.01em]",
        5: "text-[20px] tracking-normal",
        6: "text-[18px] tracking-normal",
      },
    },
    defaultVariants: {
      level: 3,
    },
  },
);

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> &
  VariantProps<typeof headingVariants> & {
    as?: ElementType;
  };

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level = 3, as, ...props }, ref) => {
    const Tag = as ?? (`h${level}` as ElementType);
    return (
      <Tag
        ref={ref}
        className={cn(headingVariants({ level, className }))}
        {...props}
      />
    );
  },
);
Heading.displayName = "Heading";
