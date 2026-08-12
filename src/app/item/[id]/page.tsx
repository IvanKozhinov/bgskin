import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemById } from "@/lib/catalog";
import type { RarityId } from "@/lib/types";
import { formatPrice, rarityColor } from "@/lib/types";
import ItemPageActions from "@/components/market/ItemPageActions";
import SimilarItems from "@/components/market/SimilarItems";

export const runtime = "nodejs";

// Russian rarity labels. Duplicated from components/market/ItemCard.tsx on
// purpose: that module is "use client", so its value exports cannot be
// consumed by this server component.
const RARITY_RU: Record<RarityId, string> = {
  consumer: "Ширпотреб",
  industrial: "Промышленное",
  milspec: "Армейское",
  restricted: "Запрещённое",
  classified: "Засекреченное",
  covert: "Тайное",
  contraband: "Контрабанда",
  extraordinary: "Экстраординарное",
};

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await getItemById(id);
  if (!item) return { title: "Предмет не найден — BGASkins.cc" };
  return {
    title: `${item.name} — BGASkins.cc`,
    description: `Купить ${item.name} за ${formatPrice(item.priceCents)} с мгновенной доставкой на BGASkins.cc`,
  };
}

export default async function ItemPage({ params }: Props) {
  const { id } = await params;
  const item = await getItemById(id);
  if (!item) notFound();

  const color = rarityColor(item.rarity);
  const skinName = item.name.includes("|")
    ? item.name.slice(item.name.indexOf("|") + 1).trim()
    : item.name;
  const minPct = Math.max(0, Math.min(100, item.minFloat * 100));
  const maxPct = Math.max(0, Math.min(100, item.maxFloat * 100));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Breadcrumbs */}
      <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/market" className="text-ink-dim transition-colors hover:text-accent">
          Маркет
        </Link>
        <span className="text-ink-faint">/</span>
        <Link
          href={`/market?weapon=${encodeURIComponent(item.weapon)}`}
          className="text-ink-dim transition-colors hover:text-accent"
        >
          {item.weapon}
        </Link>
        <span className="text-ink-faint">/</span>
        <span className="text-ink">{skinName}</span>
      </nav>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        {/* ---------- Image ---------- */}
        <div
          className="panel relative overflow-hidden p-8 sm:p-12"
          style={{ "--card-rarity": color } as CSSProperties}
        >
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 75% 65% at 50% 45%, ${color}30, transparent 72%)`,
            }}
          />
          <div className="rarity-strip absolute inset-x-8 top-0" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            className="relative aspect-[4/3] w-full object-contain"
            style={{ filter: `drop-shadow(0 24px 48px ${color}66)` }}
          />
        </div>

        {/* ---------- Info ---------- */}
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">
            <span className="text-ink-dim">{item.weapon}</span>{" "}
            <span className="text-ink">| {skinName}</span>
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={{ color, borderColor: `${color}66`, background: `${color}14` }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: color, boxShadow: `0 0 8px ${color}` }}
              />
              {RARITY_RU[item.rarity]}
            </span>
            {item.stattrak && (
              <span className="inline-flex items-center rounded-full border border-accent-hot/40 bg-accent-hot/10 px-3 py-1.5 text-xs font-semibold text-accent-hot">
                StatTrak™ доступен
              </span>
            )}
            {item.souvenir && (
              <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent">
                Souvenir доступен
              </span>
            )}
          </div>

          {item.collection && (
            <p className="mt-3 text-sm text-ink-dim">
              Коллекция: <span className="text-ink">{item.collection}</span>
            </p>
          )}

          {/* Float range */}
          <div className="panel mt-6 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xs font-bold uppercase tracking-wider text-ink-faint">
                Диапазон флоата
              </h2>
              <span className="font-display text-sm font-semibold tabular-nums">
                {item.minFloat.toFixed(2)} – {item.maxFloat.toFixed(2)}
              </span>
            </div>
            <div
              className="relative h-2.5 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #3ddc84 0%, #ffd700 35%, #ff6a00 70%, #ff4d5e 100%)",
              }}
            >
              {/* Dim the parts outside this skin's range */}
              <div
                className="absolute inset-y-0 left-0 rounded-l-full bg-bg/80"
                style={{ width: `${minPct}%` }}
              />
              <div
                className="absolute inset-y-0 right-0 rounded-r-full bg-bg/80"
                style={{ width: `${100 - maxPct}%` }}
              />
              {/* Min / max markers */}
              <div
                className="absolute -top-[5px] h-5 w-[3px] rounded-full bg-ink shadow-[0_0_6px_rgba(0,0,0,0.8)]"
                style={{ left: `calc(${minPct}% - 1px)` }}
              />
              <div
                className="absolute -top-[5px] h-5 w-[3px] rounded-full bg-ink shadow-[0_0_6px_rgba(0,0,0,0.8)]"
                style={{ left: `calc(${maxPct}% - 2px)` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
              <span>0.00 · Прямо с завода</span>
              <span>Закалённое в боях · 1.00</span>
            </div>
          </div>

          {/* Price + buy */}
          <div className="panel mt-6 flex flex-wrap items-center justify-between gap-5 p-5">
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-dim">Цена</div>
              <div className="font-display text-4xl font-bold text-accent">
                {formatPrice(item.priceCents)}
              </div>
            </div>
            <ItemPageActions item={item} />
          </div>

          <p className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
            <span className="live-dot" />
            Мгновенная доставка после подтверждения покупки
          </p>
        </div>
      </div>

      <SimilarItems weapon={item.weapon} excludeId={item.id} />
    </div>
  );
}
