import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@toiletpaper/db",
    "@toiletpaper/donto-client",
    "@toiletpaper/extractor",
    "@toiletpaper/simulator",
    "@toiletpaper/ui",
    "@donto/client",
  ],
  serverExternalPackages: ["postgres", "pdf-parse"],
  env: {
    NEXT_PUBLIC_DONTOSRV_URL:
      process.env.DONTOSRV_URL ?? "http://localhost:7879",
  },
};

export default config;
