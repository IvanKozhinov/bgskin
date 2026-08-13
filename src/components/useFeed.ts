"use client";

// Client hook for the live purchase feed (SSE via /api/feed).
// "backlog" replaces the list (newest first), "purchase" prepends.
// EventSource reconnects automatically; while the connection is down for more
// than OFFLINE_GRACE_MS the hook reports status "offline" so the UI can hide
// the feed instead of showing a frozen, stale list.

import { useEffect, useRef, useState } from "react";
import type { FeedEvent } from "@/lib/types";

export type FeedStatus = "connecting" | "live" | "offline";

const OFFLINE_GRACE_MS = 4000;

export function useFeed(max = 30): { events: FeedEvent[]; status: FeedStatus } {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const offlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/feed");

    const clearOfflineTimer = () => {
      if (offlineTimer.current) {
        clearTimeout(offlineTimer.current);
        offlineTimer.current = null;
      }
    };

    const markLive = () => {
      clearOfflineTimer();
      setStatus("live");
    };

    const onBacklog = (ev: MessageEvent<string>): void => {
      try {
        const backlog = JSON.parse(ev.data) as FeedEvent[];
        setEvents(backlog.slice(0, max));
        markLive();
      } catch {
        // malformed payload — keep current state
      }
    };

    const onPurchase = (ev: MessageEvent<string>): void => {
      try {
        const e = JSON.parse(ev.data) as FeedEvent;
        setEvents((prev) => [e, ...prev.filter((p) => p.id !== e.id)].slice(0, max));
        markLive();
      } catch {
        // malformed payload — ignore this event
      }
    };

    // A dropped stream fires "error"; EventSource retries on its own. Only flip
    // to "offline" if it stays down, so a brief blip doesn't flash the UI.
    const onError = (): void => {
      if (offlineTimer.current) return;
      offlineTimer.current = setTimeout(() => {
        offlineTimer.current = null;
        if (es.readyState !== EventSource.OPEN) {
          setStatus("offline");
          setEvents([]);
        }
      }, OFFLINE_GRACE_MS);
    };

    es.addEventListener("backlog", onBacklog);
    es.addEventListener("purchase", onPurchase);
    es.addEventListener("open", markLive);
    es.addEventListener("error", onError);

    return () => {
      clearOfflineTimer();
      es.removeEventListener("backlog", onBacklog);
      es.removeEventListener("purchase", onPurchase);
      es.removeEventListener("open", markLive);
      es.removeEventListener("error", onError);
      es.close();
    };
  }, [max]);

  return { events, status };
}
