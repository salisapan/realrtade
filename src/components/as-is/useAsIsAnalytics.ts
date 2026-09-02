import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Loads Google Analytics 4 only when VITE_GA_ID is configured (Vite env var,
 * set in .env.local / the hosting provider's env settings — never hardcoded
 * here). No-ops entirely otherwise, so the site stays trackable-free by
 * default until a real GA4 property ID is supplied.
 */
export function useAsIsAnalytics() {
  const location = useLocation();
  const gaId = import.meta.env.VITE_GA_ID as string | undefined;

  useEffect(() => {
    if (!gaId) return;
    if (document.getElementById("as-is-ga4-script")) return;

    const script = document.createElement("script");
    script.id = "as-is-ga4-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", gaId, { send_page_view: false });
  }, [gaId]);

  useEffect(() => {
    if (!gaId || !window.gtag) return;
    window.gtag("event", "page_view", {
      page_path: location.pathname,
      page_location: window.location.href,
    });
  }, [gaId, location.pathname]);
}
