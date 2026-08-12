"use client";

// Client hook for the simulated live purchase feed (SSE via /api/feed).
// "backlog" replaces the list (newest first), "purchase" prepends.
// EventSource reconnects automatically on network errors.

import { useEffect, useState } from "react";
import type { FeedEvent } from "@/lib/types";

export function useFeed(max = 30): FeedEvent[] {
  const [events, setEvents] = useState<FeedEvent[]>([]);

  useEffect(() => {
    const es = new EventSource("/api/feed");

    const onBacklog = (ev: MessageEvent<string>): void => {
      try {
        const backlog = JSON.parse(ev.data) as FeedEvent[];
        setEvents(backlog.slice(0, max));
      } catch {
        // malformed payload — keep current state
      }
    };

    const onPurchase = (ev: MessageEvent<string>): void => {
      try {
        const e = JSON.parse(ev.data) as FeedEvent;
        setEvents((prev) =>
          [e, ...prev.filter((p) => p.id !== e.id)].slice(0, max),
        );
      } catch {
        // malformed payload — ignore this event
      }
    };

    es.addEventListener("backlog", onBacklog);
    es.addEventListener("purchase", onPurchase);

    return () => {
      es.removeEventListener("backlog", onBacklog);
      es.removeEventListener("purchase", onPurchase);
      es.close();
    };
  }, [max]);

  return events;
}
