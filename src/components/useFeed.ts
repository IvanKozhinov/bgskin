"use client";

// Client hook for the live purchase feed (SSE via /api/feed).
// "backlog" replaces the list (newest first), "purchase" prepends.
//
// Robustness rules:
//  * The server sends `retry: 1000`, so a routine reconnect takes ~1 s. The
//    offline grace is far longer than that, so a normal blip never blanks the UI.
//  * EventSource gives up permanently (readyState CLOSED) when the response is
//    not a 200 text/event-stream — e.g. a 500 during a deploy. We detect that
//    and rebuild the connection ourselves with a capped backoff.
//  * A half-open socket (no bytes, no error) is caught by a watchdog: the route
//    heartbeats every 15 s, so silence beyond SILENCE_TIMEOUT_MS means dead.
//  * Events are kept while offline, so a recovery repaints instantly instead of
//    flashing skeletons.

import { useEffect, useState } from "react";
import type { FeedEvent } from "@/lib/types";

export type FeedStatus = "connecting" | "live" | "offline";

const OFFLINE_GRACE_MS = 12_000; // > worst-case UA retry + handshake
const SILENCE_TIMEOUT_MS = 45_000; // > 2 missed 15 s heartbeats
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

export function useFeed(max = 30): { events: FeedEvent[]; status: FeedStatus } {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [status, setStatus] = useState<FeedStatus>("connecting");

  useEffect(() => {
    let disposed = false;
    let es: EventSource | null = null;
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let lastMessageAt = Date.now();
    let attempts = 0;

    const clearTimer = (t: ReturnType<typeof setTimeout> | null) => {
      if (t) clearTimeout(t);
    };

    const armOffline = () => {
      if (offlineTimer) return;
      offlineTimer = setTimeout(() => {
        offlineTimer = null;
        if (!disposed) setStatus("offline");
      }, OFFLINE_GRACE_MS);
    };

    const markLive = () => {
      lastMessageAt = Date.now();
      attempts = 0;
      clearTimer(offlineTimer);
      offlineTimer = null;
      if (!disposed) setStatus("live");
    };

    /** Tear down the current stream and schedule a fresh one. */
    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      es?.close();
      es = null;
      armOffline();
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    function connect(): void {
      if (disposed) return;
      const source = new EventSource("/api/feed");
      es = source;

      source.addEventListener("open", markLive);

      source.addEventListener("backlog", (ev: MessageEvent<string>) => {
        try {
          const backlog = JSON.parse(ev.data) as FeedEvent[];
          setEvents(backlog.slice(0, max));
          markLive();
        } catch {
          // malformed payload — keep current state
        }
      });

      source.addEventListener("purchase", (ev: MessageEvent<string>) => {
        try {
          const e = JSON.parse(ev.data) as FeedEvent;
          setEvents((prev) => [e, ...prev.filter((p) => p.id !== e.id)].slice(0, max));
          markLive();
        } catch {
          // malformed payload — ignore this event
        }
      });

      // Any comment/heartbeat also counts as liveness.
      source.addEventListener("message", () => {
        lastMessageAt = Date.now();
      });

      source.addEventListener("error", () => {
        if (disposed) return;
        // CLOSED = the UA gave up for good (bad status / content-type) →
        // only our own reconnect can recover. CONNECTING = it will retry itself
        // (~1 s thanks to the server's retry field), so just arm the grace timer.
        if (source.readyState === EventSource.CLOSED) scheduleReconnect();
        else armOffline();
      });
    }

    // Catches a half-open connection: bytes stop arriving without an error.
    watchdog = setInterval(() => {
      if (disposed) return;
      if (Date.now() - lastMessageAt > SILENCE_TIMEOUT_MS) scheduleReconnect();
    }, 10_000);

    connect();

    return () => {
      disposed = true;
      clearTimer(offlineTimer);
      clearTimer(reconnectTimer);
      if (watchdog) clearInterval(watchdog);
      es?.close();
    };
  }, [max]);

  return { events, status };
}
