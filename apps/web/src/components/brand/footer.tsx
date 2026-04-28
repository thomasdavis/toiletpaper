import Link from "next/link";
import { Logo } from "./logo";
import { Perforation } from "./perforation";

interface Props {
  /** Reserved for future use (e.g. a live counter). Currently unused. */
  papersAnalyzed?: number;
}

export function Footer(_props: Props) {
  return (
    <footer className="mx-auto mt-16 max-w-6xl px-4">
      <Perforation />
      <div className="flex flex-col items-start justify-between gap-4 pb-10 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-[#9B9B9B]">
          <Logo size={18} />
          <span className="font-serif text-sm font-bold text-[#3D3D3D]">
            toiletpaper
          </span>
          <span className="text-[12px]">
            · a reproducibility engine for research papers
          </span>
        </div>
        <nav className="flex items-center gap-5 text-[12px] text-[#6B6B6B]">
          <Link href="/papers" className="hover:text-[#1A1A1A]">
            Papers
          </Link>
          <Link href="/upload" className="hover:text-[#1A1A1A]">
            Upload
          </Link>
          <a
            href="https://github.com/thomasdavis/toiletpaper"
            className="hover:text-[#1A1A1A]"
          >
            Source
          </a>
          <a
            href="https://github.com/thomasdavis/donto"
            className="hover:text-[#1A1A1A]"
          >
            Donto
          </a>
        </nav>
      </div>
    </footer>
  );
}
