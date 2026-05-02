import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Styleguide",
  description:
    "toiletpaper component and design tokens reference — colors, typography, layout primitives, and reusable UI building blocks.",
  alternates: { canonical: "/internal/styleguide" },
  robots: { index: false, follow: true },
};

export default function StyleguideLayout({ children }: { children: ReactNode }) {
  return children;
}
