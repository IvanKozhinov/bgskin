"use client";

// Thin live-feed strip under the header: LIVE label + horizontally scrolled
// row of compact purchase chips. Newest prepends on the left with a
// framer-motion layout/slide animation.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { formatPrice } from "@/lib/types";
import { useFeed } from "./useFeed";

const VISIBLE = 12;

export default function FeedTicker() {
  const pathname = usePathname();
  const events = useFeed(VISIBLE);

  if (pathname?.startsWith("/admin")) return null;

  return (
    <div className="h-12 border-b border-line bg-bg-elevated/60">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-2">
          <span className="live-dot" />
          <span className="font-display text-xs font-bold tracking-widest text-pos">
            LIVE
          </span>
        </div>

        <div className="relative min-w-0 flex-1 overflow-x-hidden">
          {events.length === 0 ? (
            <div className="flex items-center gap-2.5">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="skeleton h-8 w-52 shrink-0" />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <AnimatePresence initial={false}>
                {events.map((e, i) => (
                  <motion.div
                    key={e.id}
                    layout
                    initial={{ opacity: 0, x: -24, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="shrink-0"
                  >
                    <Link
                      href={`/item/${e.itemId}`}
                      className={`flex items-center gap-2 rounded-lg border border-line bg-panel/80 py-1 pl-1.5 pr-2.5 transition-colors hover:border-line-bright ${
                        i === 0 ? "feed-in" : ""
                      }`}
                      title={`${e.buyer} купил ${e.itemName}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={e.image}
                        alt=""
                        width={32}
                        height={32}
                        loading="lazy"
                        className="h-8 w-8 shrink-0 object-contain"
                      />
                      <span className="max-w-40 truncate text-xs text-ink-dim">
                        {e.itemName}
                      </span>
                      <span className="font-display text-xs font-bold text-accent">
                        {formatPrice(e.priceCents)}
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-bg-elevated to-transparent" />
        </div>
      </div>
    </div>
  );
}
