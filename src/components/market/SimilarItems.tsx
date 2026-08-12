"use client";

import { useEffect, useState } from "react";
import type { CatalogItem, CatalogResponse } from "@/lib/types";
import ItemCard from "./ItemCard";

export default function SimilarItems({ weapon, excludeId }: { weapon: string; excludeId: string }) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Ask for one extra so we still have 4 after excluding the current item.
    fetch(`/api/catalog?weapon=${encodeURIComponent(weapon)}&perPage=5&sort=popular`)
      .then((r) => r.json())
      .then((d: CatalogResponse) => {
        if (cancelled) return;
        setItems(d.items.filter((i) => i.id !== excludeId).slice(0, 4));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [weapon, excludeId]);

  if (items !== null && items.length === 0) return null;

  return (
    <section className="mt-14">
      <h2 className="mb-4 font-display text-xl font-bold tracking-wide">Похожие предметы</h2>
      {items === null ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[3/4]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
