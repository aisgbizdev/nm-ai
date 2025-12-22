"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getFirebaseAnalytics } from "@/lib/firebase";

export default function AnalyticsRouteTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    (async () => {
      const analytics = await getFirebaseAnalytics();
      if (!analytics) return;

      const { logEvent } = await import("firebase/analytics");

      const qs = searchParams?.toString();
      const page_location =
        typeof window !== "undefined"
          ? window.location.origin + pathname + (qs ? `?${qs}` : "")
          : pathname;

      // GA4 style page_view for SPA
      logEvent(analytics, "page_view", {
        page_location,
        page_path: pathname + (qs ? `?${qs}` : ""),
        page_title: typeof document !== "undefined" ? document.title : "",
      });
    })();
  }, [pathname, searchParams]);

  return null;
}
