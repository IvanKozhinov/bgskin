"use client";

// Landing hero: headline + CTAs on the left, floating showcase of the three
// most expensive catalog items on the right with mouse parallax and a gentle
// float loop. Ambient blobs + tactical grid backdrop.

import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useState, type CSSProperties } from "react";
import type { CatalogItem, CatalogResponse } from "@/lib/types";
import { formatPrice, rarityColor } from "@/lib/types";

interface Slot {
  top: string;
  left: string;
  width: string;
  depth: number; // parallax travel, px
  float: number; // float loop amplitude, px
  dur: number; // float loop duration, s
  delay: number; // float loop phase offset, s
  z: number;
  rot: number; // static tilt, deg
}

const SLOTS: Slot[] = [
  { top: "2%", left: "22%", width: "52%", depth: 22, float: 9, dur: 6.4, delay: 0, z: 30, rot: -2.5 },
  { top: "40%", left: "54%", width: "42%", depth: 40, float: 12, dur: 7.6, delay: 0.9, z: 20, rot: 3 },
  { top: "52%", left: "4%", width: "40%", depth: 58, float: 10, dur: 8.4, delay: 1.7, z: 10, rot: -1.5 },
];

function ShowcaseCard({
  item,
  slot,
  index,
  px,
  py,
}: {
  item: CatalogItem;
  slot: Slot;
  index: number;
  px: MotionValue<number>;
  py: MotionValue<number>;
}) {
  const x = useTransform(px, (v) => v * slot.depth);
  const y = useTransform(py, (v) => v * slot.depth);
  const color = rarityColor(item.rarity);

  return (
    <motion.div
      className="absolute"
      style={{ x, y, top: slot.top, left: slot.left, width: slot.width, zIndex: slot.z }}
    >
      <motion.div
        initial={{ opacity: 0, y: 36, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.15 + index * 0.14, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          animate={{ y: [0, -slot.float, 0] }}
          transition={{ duration: slot.dur, repeat: Infinity, ease: "easeInOut", delay: slot.delay }}
          style={{ rotate: slot.rot }}
        >
          <div
            className="overflow-hidden rounded-xl border bg-gradient-to-b from-panel to-bg-elevated p-3"
            style={{
              borderColor: `${color}55`,
              boxShadow: `0 0 0 1px ${color}22, 0 24px 64px -20px ${color}66, 0 12px 32px -12px rgba(0,0,0,0.65)`,
            }}
          >
            <div
              className="rarity-strip mb-2"
              style={{ "--card-rarity": color } as CSSProperties}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image}
              alt={item.name}
              loading="lazy"
              className="aspect-[4/3] w-full object-contain"
              style={{ filter: `drop-shadow(0 10px 22px ${color}44)` }}
            />
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-ink-dim">{item.name}</span>
              <span className="shrink-0 font-display text-sm font-bold text-accent">
                {formatPrice(item.priceCents)}
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function Hero() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const px = useSpring(mx, { stiffness: 60, damping: 18, mass: 0.6 });
  const py = useSpring(my, { stiffness: 60, damping: 18, mass: 0.6 });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog?sort=price_desc&perPage=3")
      .then((r) => r.json() as Promise<CatalogResponse>)
      .then((d) => {
        if (!cancelled) setItems(d.items.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onMouseMove(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function onMouseLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <section
      className="relative overflow-hidden"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* Grid pattern on its own layer — the mask on .bg-grid clips only this
          div, never the content above it (buttons/showcase). */}
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />

      {/* Ambient blobs */}
      <div className="blob -top-24 left-[8%] h-80 w-80 bg-accent/35" />
      <div className="blob right-[4%] top-24 h-96 w-96 bg-violet/35" />

      {/* Generated ambient art — right-anchored, fades to the left so the
          headline stays on clean dark space. */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] bg-cover bg-right bg-no-repeat opacity-35 lg:block"
        style={{
          backgroundImage: "url(/art/hero-bg.webp)",
          maskImage: "linear-gradient(to right, transparent, black 60%)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 60%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-2 lg:pb-28 lg:pt-24">
        {/* Left: copy + CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="font-display text-sm font-semibold tracking-widest text-accent">
            CS2 SKINS MARKET
          </p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-[1.06] sm:text-6xl">
            Скины CS2 по{" "}
            <span className="text-glow text-accent">честным ценам</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-dim">
            Моментальная доставка через трейд-оффер, живые цены и оплата в пару
            кликов — без ожиданий и переплат.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/market" className="btn-primary">
              Открыть маркет
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M3 8h10m0 0-4-4m4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <a href="/api/auth/steam" className="btn-ghost">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2a10 10 0 0 0-9.97 9.24l5.35 2.21a2.83 2.83 0 0 1 1.6-.5h.14l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.12a2.83 2.83 0 1 1-5.66 0v-.09l-3.83-1.58A10 10 0 1 0 12 2Zm-5.7 13.5 1.23.51a2.12 2.12 0 1 0 1.1-2.94l1.27.52a1.56 1.56 0 1 1-3.6 1.91Zm9-4.04a2.51 2.51 0 1 1 0-5.02 2.51 2.51 0 0 1 0 5.02Zm0-.63a1.89 1.89 0 1 0 0-3.77 1.89 1.89 0 0 0 0 3.77Z" />
              </svg>
              Войти через Steam
            </a>
          </div>
        </motion.div>

        {/* Right: floating showcase */}
        <div className="relative hidden h-[420px] sm:block lg:h-[460px]" aria-hidden>
          {items === null
            ? SLOTS.map((slot) => (
                <div
                  key={slot.top}
                  className="skeleton absolute"
                  style={{
                    top: slot.top,
                    left: slot.left,
                    width: slot.width,
                    height: "44%",
                    zIndex: slot.z,
                    transform: `rotate(${slot.rot}deg)`,
                  }}
                />
              ))
            : items.map((item, i) => (
                <ShowcaseCard
                  key={item.id}
                  item={item}
                  slot={SLOTS[i] ?? SLOTS[0]}
                  index={i}
                  px={px}
                  py={py}
                />
              ))}
        </div>
      </div>
    </section>
  );
}
