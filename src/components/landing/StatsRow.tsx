"use client";

// Stats strip under the hero: four counters that count up once they scroll
// into view. Catalog size comes from the API; the rest are static marketing
// numbers.

import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { CatalogResponse } from "@/lib/types";

const FALLBACK_TOTAL = 200;

/** rAF count-up with cubic ease-out; starts when `active` becomes true. */
function useCountUp(target: number, active: boolean, duration = 1400): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);

  return value;
}

function StatCell({
  target,
  active,
  prefix = "",
  suffix = "",
  label,
}: {
  target: number;
  active: boolean;
  prefix?: string;
  suffix?: string;
  label: string;
}) {
  const value = useCountUp(target, active);
  return (
    <div className="flex flex-col items-center gap-1 bg-panel px-4 py-5 text-center">
      <span className="font-display text-3xl font-bold text-ink sm:text-4xl">
        {prefix}
        <span className="text-accent">{value.toLocaleString("ru-RU")}</span>
        {suffix}
      </span>
      <span className="text-sm text-ink-dim">{label}</span>
    </div>
  );
}

export default function StatsRow() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog?perPage=1")
      .then((r) => r.json() as Promise<CatalogResponse>)
      .then((d) => {
        if (!cancelled && typeof d.total === "number") setTotal(d.total);
      })
      .catch(() => {
        if (!cancelled) setTotal(FALLBACK_TOTAL);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      ref={ref}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] lg:grid-cols-4"
    >
      <StatCell
        target={total ?? FALLBACK_TOTAL}
        active={inView && total !== null}
        suffix="+"
        label="предметов в каталоге"
      />
      <StatCell target={5} active={inView} prefix="≤ " suffix=" мин" label="доставка предмета" />
      <StatCell target={24} active={inView} suffix="/7" label="работаем онлайн" />
      <StatCell target={1000} active={inView} suffix="+" label="сделок в день" />
    </div>
  );
}
