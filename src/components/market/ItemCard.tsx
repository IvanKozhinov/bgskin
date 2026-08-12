"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CatalogItem, RarityId } from "@/lib/types";
import { formatPrice, rarityColor } from "@/lib/types";
import { onImgError } from "@/lib/img";
import BuyModal from "./BuyModal";

/** Russian labels for CS2 rarity tiers (UI copy, colors come from RARITY_META). */
export const RARITY_RU: Record<RarityId, string> = {
  consumer: "Ширпотреб",
  industrial: "Промышленное",
  milspec: "Армейское",
  restricted: "Запрещённое",
  classified: "Засекреченное",
  covert: "Тайное",
  contraband: "Контрабанда",
  extraordinary: "Экстраординарное",
};

/** "AK-47 | Redline" -> "Redline"; falls back to the full name. */
export function skinNameOf(item: CatalogItem): string {
  const idx = item.name.indexOf("|");
  return idx >= 0 ? item.name.slice(idx + 1).trim() : item.name;
}

export default function ItemCard({ item }: { item: CatalogItem }) {
  const [buyOpen, setBuyOpen] = useState(false);
  const color = rarityColor(item.rarity);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="h-full"
      >
        <Link
          href={`/item/${item.id}`}
          className="card group relative flex h-full flex-col overflow-hidden"
          style={{ "--card-rarity": color } as CSSProperties}
        >
          <div className="rarity-strip" />

          <div className="relative aspect-[4/3] w-full px-4 pt-3">
            {item.stattrak && (
              <span className="absolute left-3 top-2 z-10 rounded border border-accent-hot/40 bg-accent-hot/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent-hot">
                ST™
              </span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image}
              alt={item.name}
              loading="lazy"
              onError={onImgError}
              className="h-full w-full object-contain transition-transform duration-300 ease-out group-hover:scale-[1.06]"
              style={{ filter: `drop-shadow(0 12px 22px ${color}55)` }}
            />
          </div>

          <div className="flex flex-1 flex-col gap-0.5 p-4 pt-2">
            <div className="text-xs text-ink-dim">{item.weapon}</div>
            <div className="truncate font-display font-semibold" title={item.name}>
              {skinNameOf(item)}
            </div>
            <div className="text-[11px] font-medium" style={{ color }}>
              {RARITY_RU[item.rarity]}
            </div>
            <div className="mt-auto pt-2 font-display text-lg font-bold text-accent">
              {formatPrice(item.priceCents)}
            </div>
          </div>

          {/* Hover-reveal buy action */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-bg/95 via-bg/70 to-transparent p-3 pt-10 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <button
              type="button"
              className="btn-primary w-full !py-2 text-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setBuyOpen(true);
              }}
            >
              Купить
            </button>
          </div>
        </Link>
      </motion.div>

      {/* Rendered outside the Link: portal events bubble through the React tree,
          so a modal nested under <Link> would trigger navigation on click. */}
      <AnimatePresence>
        {buyOpen && <BuyModal item={item} onClose={() => setBuyOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
