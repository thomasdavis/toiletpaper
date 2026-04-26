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
      <body className="min-h-screen bg-[#FAFAF8] text-[#1A1A1A] antialiased">
        <nav className="border-b border-[#D4D0C8] bg-white">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="font-serif text-lg font-bold tracking-tight text-[#1A1A1A]">
              toiletpaper
            </Link>
            <div className="flex items-center gap-4 text-sm text-[#6B6B6B]">
              <Link href="/papers" className="hover:text-[#1A1A1A]">
                Papers
              </Link>
              <Link href="/upload" className="hover:text-[#1A1A1A]">
                Upload
              </Link>
              <Link href="/styleguide" className="hover:text-[#1A1A1A]">
                Styleguide
              </Link>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
