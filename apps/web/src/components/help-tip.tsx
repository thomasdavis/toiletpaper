"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface HelpTipProps {
  text: string;
  className?: string;
}

export function HelpTip({ text, className = "" }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, close]);

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[#4A6FA5]/30 text-[11px] font-semibold leading-none text-[#4A6FA5] transition-colors hover:bg-[#4A6FA5]/10 cursor-pointer"
        aria-label="Help"
      >
        ?
      </button>
      {open && (
        <div className="absolute left-1/2 bottom-full mb-2 z-50 w-72 -translate-x-1/2 rounded-lg border border-[#E8E5DE] bg-white p-3 text-[13px] leading-relaxed text-[#3D3D3D] shadow-lg">
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-[6px] border-transparent border-t-white" />
          {text}
        </div>
      )}
    </div>
  );
}
