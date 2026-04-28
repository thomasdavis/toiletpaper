"use client";

import { usePathname } from "next/navigation";

const ROMAN: Record<string, string> = {
  "/": "i",
  "/papers": "ii",
  "/upload": "iii",
  "/styleguide": "iv",
};

const SUB: Record<string, string> = {
  report: "r",
  annotated: "a",
  simulations: "s",
};

function pathToFolio(path: string): string {
  if (ROMAN[path]) return ROMAN[path];

  const m = path.match(/^\/papers\/([^/]+)(?:\/([^/]+))?/);
  if (m) {
    const short = m[1].slice(-4);
    const sub = m[2] ? SUB[m[2]] : "";
    return sub ? `${short}.${sub}` : short;
  }
  return "—";
}

/**
 * Tiny, tracked-mono folio that lives in the page footer corner.
 * Reads like a manuscript page number; doubles as the brand mark.
 */
export function Folio() {
  const path = usePathname() ?? "/";
  return (
    <span className="select-none font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-[#B8B2A4]">
      tp · {pathToFolio(path)}
    </span>
  );
}
