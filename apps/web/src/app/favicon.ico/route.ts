import { NextResponse } from "next/server";

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#FAFAF8"/>
  <path d="M17 14h30v36H17z" fill="#fff" stroke="#1A1A1A" stroke-width="4"/>
  <path d="M24 25h16M24 32h16M24 39h10" stroke="#4A6FA5" stroke-width="4" stroke-linecap="round"/>
</svg>`;

export function GET() {
  return new NextResponse(ICON, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
