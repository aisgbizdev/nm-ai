"use client";

import { useEffect } from "react";
import { getFirebaseAnalytics } from "@/lib/firebase";

export default function AnalyticsBoot() {
  useEffect(() => {
    (async () => {
      const analytics = await getFirebaseAnalytics();
      // kalau null: biasanya karena SSR / ga support / ke-block extension
      if (!analytics) return;

      // Firebase biasanya auto-log page_view saat analytics di-init,
      // tapi ini optional kalau lu mau nambah event custom nanti.
      // const { logEvent } = await import("firebase/analytics");
      // logEvent(analytics, "page_view");
    })();
  }, []);

  return null;
}
