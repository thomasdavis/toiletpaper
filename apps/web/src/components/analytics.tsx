"use client";

import { useEffect } from "react";

// Sentry (errors/perf/replay via CDN loader) + Umami (visitor analytics). Fails open.
declare global {
  interface Window {
    sentryOnLoad?: () => void;
    Sentry?: { init: (c: Record<string, unknown>) => void };
    __tpAnalytics?: boolean;
  }
}

const SENTRY_KEY = "34bfce13b9529c3cc2aa050c0d1e5fc3";
const UMAMI_ID = "13bd7a31-81c2-4346-8714-1ca7a03708e6";

export function Analytics() {
  useEffect(() => {
    if (typeof window === "undefined" || window.__tpAnalytics) return;
    window.__tpAnalytics = true;
    try {
      const u = document.createElement("script");
      u.src = "https://analytics.donto.org/script.js";
      u.defer = true;
      u.setAttribute("data-website-id", UMAMI_ID);
      document.head.appendChild(u);
    } catch {}
    try {
      window.sentryOnLoad = function () {
        try { window.Sentry?.init({ tracesSampleRate: 0.2, replaysSessionSampleRate: 0.05, replaysOnErrorSampleRate: 1.0 }); } catch {}
      };
      const s = document.createElement("script");
      s.src = `https://js.sentry-cdn.com/${SENTRY_KEY}.min.js`;
      s.crossOrigin = "anonymous";
      s.async = true;
      document.head.appendChild(s);
    } catch {}
  }, []);
  return null;
}
