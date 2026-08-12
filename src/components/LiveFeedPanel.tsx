"use client";

// Larger vertical live-feed panel for the landing page: header with a pulsing
// dot, last ~8 purchase rows with item image, masked buyer, rarity-colored
// item name, price and a relative timestamp refreshed every 30 s.

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { formatPrice, rarityColor } from "@/lib/types";
import { useFeed } from "./useFeed";

const ROWS = 8;

function relativeTime(ts: number, now: number): string {
  const diffMin = Math.floor(Math.max(0, now - ts) / 60_000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  return `${Math.floor(diffMin / 60)} ч назад`;
}

export default function LiveFeedPanel() {
  const events = useFeed(ROWS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="live-dot" />
        <h2 className="font-display text-lg font-bold tracking-wide">
          Лайв-лента
        </h2>
        <span className="ml-auto text-xs text-ink-faint">
          покупки в реальном времени
        </span>
      </div>

      <ul className="divide-y divide-line/60">
        {events.length === 0 ? (
          Array.from({ length: ROWS }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="skeleton h-12 w-12 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-3 w-40 max-w-full" />
              </div>
              <div className="skeleton h-4 w-14 shrink-0" />
            </li>
          ))
        ) : (
          <AnimatePresence initial={false}>
            {events.map((e) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  href={`/item/${e.itemId}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-panel-2/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.image}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    className="h-12 w-12 shrink-0 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      <span className="font-medium text-ink">{e.buyer}</span>{" "}
                      <span className="text-ink-dim">купил</span>
                    </div>
                    <div
                      className="truncate text-sm font-medium"
                      style={{ color: rarityColor(e.rarity) }}
                    >
                      {e.itemName}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-sm font-bold text-accent">
                      {formatPrice(e.priceCents)}
                    </div>
                    <div className="text-[11px] text-ink-faint">
                      {relativeTime(e.ts, now)}
                    </div>
                  </div>
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        )}
      </ul>
    </section>
  );
}
