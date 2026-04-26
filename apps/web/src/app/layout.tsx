import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { NavBar } from "@toiletpaper/ui";
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
        <NavBar brand={<Link href="/">toiletpaper</Link>}>
          <Link href="/papers" className="hover:text-stone-900">
            Papers
          </Link>
          <Link href="/upload" className="hover:text-stone-900">
            Upload
          </Link>
          <Link href="/styleguide" className="hover:text-stone-900">
            Styleguide
          </Link>
        </NavBar>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
