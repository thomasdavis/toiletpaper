import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "rounded-md bg-[#4A6FA5] text-white shadow-sm hover:bg-[#3A5A87] active:bg-[#2E4A6F]",
        secondary: "rounded-md border border-[#D4D0C8] bg-white text-[#1A1A1A] shadow-sm hover:bg-[#F5F3EF] active:bg-[#E8E5DE]",
        destructive: "rounded-md bg-[#9B2226] text-white shadow-sm hover:bg-[#7A1A1D] active:bg-[#5C1316]",
        ghost: "rounded-md text-[#3D3D3D] hover:bg-[#F5F3EF] active:bg-[#E8E5DE]",
        link: "text-[#4A6FA5] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 gap-1.5 px-4 text-sm",
        default: "h-11 gap-2 px-6 text-sm",
        lg: "h-12 gap-2.5 px-8 text-base",
        icon: "h-11 w-11 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = "Button";
