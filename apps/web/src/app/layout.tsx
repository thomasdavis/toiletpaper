import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { DebugProvider } from "@/components/debug-provider";
import { DebugToggle } from "@/components/debug-toggle";
import { Footer } from "@/components/brand";
import { db } from "@/lib/db";
import { papers } from "@toiletpaper/db";
import { count } from "drizzle-orm";
import "./globals.css";

// The footer reads a live paper count, so the layout can't be prerendered.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_NAME = "toiletpaper";
const SITE_URL = "https://toiletpaper.dev";
const SITE_DESCRIPTION =
  "Upload research papers, extract claims, run adversarial physics simulations, and verify which results actually reproduce.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "paper reproduction",
    "scientific reproducibility",
    "claim extraction",
    "physics simulation",
    "research verification",
    "open science",
    "arxiv",
  ],
  authors: [{ name: "toiletpaper" }],
  creator: "toiletpaper",
  publisher: "toiletpaper",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  alternates: {
    canonical: "/",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport = {
  themeColor: "#FAFAF8",
  width: "device-width",
  initialScale: 1,
};

async function getPaperCount(): Promise<number | undefined> {
  try {
    const [r] = await db.select({ value: count() }).from(papers);
    return r?.value ?? 0;
  } catch {
    return undefined;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const papersAnalyzed = await getPaperCount();
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FAFAF8] text-[#1A1A1A] antialiased">
        <DebugProvider>
          <nav className="border-b border-[#E8E5DE] bg-white">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-[#1A1A1A]"
              >
                <span className="font-serif text-lg font-bold tracking-tight">
                  toiletpaper
                </span>
              </Link>
              <div className="flex items-center gap-5 text-sm text-[#6B6B6B]">
                <Link href="/papers" className="transition-colors hover:text-[#1A1A1A]">
                  Papers
                </Link>
                <Link href="/upload" className="transition-colors hover:text-[#1A1A1A]">
                  Upload
                </Link>
                <Link href="/styleguide" className="transition-colors hover:text-[#1A1A1A]">
                  Styleguide
                </Link>
              </div>
              <div className="ml-auto">
                <DebugToggle />
              </div>
            </div>
          </nav>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          <Footer papersAnalyzed={papersAnalyzed} />
        </DebugProvider>
      </body>
    </html>
  );
}
