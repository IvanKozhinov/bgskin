"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { CatalogItem } from "@/lib/types";
import BuyModal from "./BuyModal";

export default function ItemPageActions({ item }: { item: CatalogItem }) {
  const [buyOpen, setBuyOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn-primary w-full !px-10 !py-3.5 text-base sm:w-auto"
        onClick={() => setBuyOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 4h2l2.4 12.2A2 2 0 0 0 9.36 18h8.9a2 2 0 0 0 1.96-1.6L22 8H6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="21" r="1.4" fill="currentColor" />
          <circle cx="18" cy="21" r="1.4" fill="currentColor" />
        </svg>
        Купить
      </button>
      <AnimatePresence>
        {buyOpen && <BuyModal item={item} onClose={() => setBuyOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
