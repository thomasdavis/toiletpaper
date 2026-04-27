"use client";

import { useDebug } from "./debug-provider";

export function DebugToggle() {
  const { debug, toggleDebug } = useDebug();

  return (
    <button
      type="button"
      onClick={toggleDebug}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
        debug
          ? "bg-[#F59E0B] text-[#1A1A1A]"
          : "bg-[#F5F3EF] text-[#9B9B9B] hover:bg-[#E8E5DE] hover:text-[#6B6B6B]"
      }`}
    >
      Debug: {debug ? "ON" : "OFF"}
    </button>
  );
}
