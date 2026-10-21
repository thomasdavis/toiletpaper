"use client";

import { useEffect } from "react";

// Sentry (errors/perf/replay via CDN loader) + Google Analytics 4 (visitor analytics). Fails open.
declare global {
  interface Window {
    sentryOnLoad?: () => void;
    Sentry?: { init: (c: Record<string, unknown>) => void };
    __tpAnalytics?: boolean;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const SENTRY_KEY = "34bfce13b9529c3cc2aa050c0d1e5fc3";
const GA_MEASUREMENT_ID = "G-1WQHB184PV";

export function Analytics() {
  useEffect(() => {
    if (typeof window === "undefined" || window.__tpAnalytics) return;
    window.__tpAnalytics = true;
    try {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        // gtag.js expects the Arguments object itself.
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer!.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", GA_MEASUREMENT_ID);
      const g = document.createElement("script");
      g.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      g.async = true;
      document.head.appendChild(g);
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
