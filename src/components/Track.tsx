"use client";

// Best-effort pageview beacon. Fires once per client-side navigation, skipping
// the admin area. Uses navigator.sendBeacon so the request survives an
// immediate unload; falls back to a keepalive fetch when unavailable.

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function Track() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;

    const body = JSON.stringify({ path: pathname });

    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon("/api/track", blob)) return;
      }
    } catch {
      // fall through to fetch below
    }

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
