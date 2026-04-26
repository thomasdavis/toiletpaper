import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "toiletpaper",
  description:
    "Upload papers, extract claims, simulate physics, verify truth.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-stone-900 antialiased">
        <nav className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              toiletpaper
            </Link>
            <Link
              href="/papers"
              className="text-sm text-muted hover:text-stone-900"
            >
              Papers
            </Link>
            <Link
              href="/upload"
              className="text-sm text-muted hover:text-stone-900"
            >
              Upload
            </Link>
            <Link
              href="/styleguide"
              className="text-sm text-muted hover:text-stone-900"
            >
              Styleguide
            </Link>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
