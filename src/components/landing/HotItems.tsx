"use client";

// "Горячие предметы" grid on the landing page: six most popular catalog
// items, rendered with the shared market ItemCard and a staggered reveal.

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import ItemCard from "@/components/market/ItemCard";
import type { CatalogItem, CatalogResponse } from "@/lib/types";

export default function HotItems() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog?sort=popular&perPage=6")
      .then((r) => r.json() as Promise<CatalogResponse>)
      .then((d) => {
        if (!cancelled) setItems(d.items.slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-64" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
        <p className="text-ink-dim">Каталог пока пуст — загляните чуть позже.</p>
        <Link href="/market" className="text-sm font-medium text-accent hover:text-accent-hot">
          Перейти в маркет →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          <ItemCard item={item} />
        </motion.div>
      ))}
    </div>
  );
}
