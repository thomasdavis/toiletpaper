import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Upload",
  description:
    "Upload a research paper (PDF or markdown) and toiletpaper will extract its claims and run reproducibility simulations.",
  alternates: { canonical: "/upload" },
  openGraph: {
    title: "Upload · toiletpaper",
    description:
      "Upload a research paper (PDF or markdown) and toiletpaper will extract its claims and run reproducibility simulations.",
    url: "/upload",
    type: "website",
  },
};

export default function UploadLayout({ children }: { children: ReactNode }) {
  return children;
}
