"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  CatalogFacets,
  CatalogItem,
  CatalogResponse,
  ItemCategory,
  RarityId,
} from "@/lib/types";
import { RARITY_META, formatPrice, rarityColor } from "@/lib/types";
import ItemCard, { RARITY_RU } from "./ItemCard";

const PER_PAGE = 24;

const FILTER_KEYS = ["q", "category", "weapon", "rarity", "minPrice", "maxPrice", "stattrak", "sort"] as const;

const CATEGORIES: { value: ItemCategory | null; label: string }[] = [
  { value: null, label: "Все" },
  { value: "pistol", label: "Пистолеты" },
  { value: "rifle", label: "Винтовки" },
  { value: "smg", label: "ПП" },
  { value: "heavy", label: "Тяжёлое" },
  { value: "knife", label: "Ножи" },
  { value: "gloves", label: "Перчатки" },
];

const SORTS: { value: NonNullable<"popular" | "price_asc" | "price_desc" | "name">; label: string }[] = [
  { value: "popular", label: "Популярные" },
  { value: "price_asc", label: "Сначала дешёвые" },
  { value: "price_desc", label: "Сначала дорогие" },
  { value: "name", label: "По названию" },
];

const RARITY_ORDER = Object.keys(RARITY_META) as RarityId[];

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** "1050" (cents URL param) -> "10.5" (dollar input value). */
function centsParamToDollars(v: string | null): string {
  if (!v) return "";
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? String(n / 100) : "";
}

/** Dollar input value -> integer cents, or null when empty/invalid. */
function dollarsToCents(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

const trimEq = (a: string, b: string) => a.trim() === b.trim();
const centsEq = (a: string, b: string) => dollarsToCents(a) === dollarsToCents(b);

/**
 * Controlled input value that mirrors a URL param: local edits are pushed to
 * the URL after `delay` ms; external URL changes (back button, reset) sync
 * back into the input. `eq` compares input vs URL in canonical form so that
 * e.g. "10.50" and "10.5" don't ping-pong.
 */
function useUrlSyncedInput(
  urlValue: string,
  delay: number,
  push: (v: string) => void,
  eq: (a: string, b: string) => boolean,
): [string, (v: string) => void] {
  const [value, setValue] = useState(urlValue);
  const lastSynced = useRef(urlValue);

  useEffect(() => {
    if (urlValue !== lastSynced.current) {
      lastSynced.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);

  useEffect(() => {
    if (eq(value, urlValue)) return;
    const t = setTimeout(() => {
      lastSynced.current = value;
      push(value);
    }, delay);
    return () => clearTimeout(t);
  }, [value, urlValue, delay, push, eq]);

  return [value, setValue];
}

function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-[4/3] w-full !rounded-none" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-3 w-1/3" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-5 w-1/2" />
      </div>
    </div>
  );
}

interface PageData {
  /** The filterKey this data was fetched for. */
  key: string;
  items: CatalogItem[];
  total: number;
  facets: CatalogFacets | null;
  page: number;
}

export default function MarketClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const reqIdRef = useRef(0);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  // Canonical filter query string (only known keys, stable order via URLSearchParams).
  const filterKey = useMemo(() => {
    const out = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = searchParams.get(k);
      if (v) out.set(k, v);
    }
    return out.toString();
  }, [searchParams]);

  // --- current filter values from the URL ---
  const category = searchParams.get("category");
  const weapon = searchParams.get("weapon");
  const stattrak = searchParams.get("stattrak") === "1";
  const sort = searchParams.get("sort") ?? "popular";
  const urlQ = searchParams.get("q") ?? "";
  const urlMin = centsParamToDollars(searchParams.get("minPrice"));
  const urlMax = centsParamToDollars(searchParams.get("maxPrice"));

  const selectedRarities = useMemo(
    () =>
      (searchParams.get("rarity") ?? "")
        .split(",")
        .filter((r): r is RarityId => r in RARITY_META),
    [searchParams],
  );

  const pushQ = useCallback((v: string) => updateParams({ q: v.trim() || null }), [updateParams]);
  const pushMin = useCallback(
    (v: string) => {
      const c = dollarsToCents(v);
      updateParams({ minPrice: c === null ? null : String(c) });
    },
    [updateParams],
  );
  const pushMax = useCallback(
    (v: string) => {
      const c = dollarsToCents(v);
      updateParams({ maxPrice: c === null ? null : String(c) });
    },
    [updateParams],
  );

  const [search, setSearch] = useUrlSyncedInput(urlQ, 300, pushQ, trimEq);
  const [minD, setMinD] = useUrlSyncedInput(urlMin, 450, pushMin, centsEq);
  const [maxD, setMaxD] = useUrlSyncedInput(urlMax, 450, pushMax, centsEq);

  // Fetch page 1 whenever filters change (and on mount). `loading` is derived
  // from pageData.key so the effect only sets state from async callbacks.
  useEffect(() => {
    const id = ++reqIdRef.current;
    fetch(`/api/catalog?${filterKey ? `${filterKey}&` : ""}page=1&perPage=${PER_PAGE}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: CatalogResponse) => {
        if (reqIdRef.current !== id) return;
        setFetchError(false);
        setPageData({ key: filterKey, items: d.items, total: d.total, facets: d.facets, page: 1 });
      })
      .catch(() => {
        if (reqIdRef.current !== id) return;
        // Distinguish a failed request from a genuinely empty result set.
        setFetchError(true);
        setPageData({ key: filterKey, items: [], total: 0, facets: null, page: 1 });
      });
  }, [filterKey, reloadNonce]);

  // Stale data (from previous filters) stays on screen, dimmed, while the new page loads.
  const loading = pageData === null || pageData.key !== filterKey;
  const items = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const facets = pageData?.facets ?? null;

  async function loadMore() {
    if (pageData === null || pageData.key !== filterKey) return;
    const id = reqIdRef.current;
    const next = pageData.page + 1;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/catalog?${filterKey ? `${filterKey}&` : ""}page=${next}&perPage=${PER_PAGE}`);
      const d = (await r.json()) as CatalogResponse;
      if (reqIdRef.current !== id) return;
      setPageData((prev) =>
        prev && prev.key === filterKey
          ? { key: prev.key, items: [...prev.items, ...d.items], total: d.total, facets: d.facets, page: next }
          : prev,
      );
    } catch {
      // network error — keep what we have
    } finally {
      if (reqIdRef.current === id) setLoadingMore(false);
    }
  }

  function toggleRarity(r: RarityId) {
    const next = selectedRarities.includes(r)
      ? selectedRarities.filter((x) => x !== r)
      : [...selectedRarities, r];
    updateParams({ rarity: next.join(",") || null });
  }

  function reset() {
    router.replace(pathname, { scroll: false });
  }

  const hasFilters = filterKey !== "";

  const rarityRows = useMemo(() => {
    const map = new Map<RarityId, number>();
    for (const f of facets?.rarities ?? []) map.set(f.rarity, f.count);
    for (const r of selectedRarities) if (!map.has(r)) map.set(r, 0);
    return RARITY_ORDER.filter((r) => map.has(r)).map((r) => ({ rarity: r, count: map.get(r) ?? 0 }));
  }, [facets, selectedRarities]);

  const bounds = facets?.priceBoundsCents ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-wide">Маркет</h1>
        <p className="mt-1 text-sm text-ink-dim">Скины CS2 с мгновенной доставкой на ваш аккаунт</p>
      </div>

      <div className="flex flex-col items-start gap-6 md:flex-row">
        {/* ---------- Sidebar ---------- */}
        <aside
          className={`${filtersOpen ? "block" : "hidden"} w-full shrink-0 md:sticky md:top-20 md:block md:max-h-[calc(100vh-6rem)] md:w-64 md:overflow-y-auto`}
        >
          <div className="panel space-y-6 p-4">
            {/* Search */}
            <div className="relative">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              >
                <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
                <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                className="input !pl-9 text-sm"
                type="text"
                placeholder="Поиск скинов…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Поиск по каталогу"
              />
            </div>

            {/* Category */}
            <div>
              <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-ink-faint">
                Категория
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => {
                  const active = category === c.value || (c.value === null && !category);
                  return (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => updateParams({ category: c.value })}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? "border-accent/60 bg-accent/15 text-accent"
                          : "border-line text-ink-dim hover:border-line-bright hover:text-ink"
                      }`}
                      aria-pressed={active}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rarity */}
            <div>
              <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-ink-faint">
                Редкость
              </h3>
              {rarityRows.length === 0 ? (
                <div className="space-y-1.5">
                  <div className="skeleton h-7" />
                  <div className="skeleton h-7" />
                  <div className="skeleton h-7" />
                </div>
              ) : (
                <div className="space-y-0.5">
                  {rarityRows.map(({ rarity, count }) => {
                    const active = selectedRarities.includes(rarity);
                    const color = rarityColor(rarity);
                    return (
                      <button
                        key={rarity}
                        type="button"
                        onClick={() => toggleRarity(rarity)}
                        aria-pressed={active}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                          active ? "bg-panel-2" : "hover:bg-panel-2/60"
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: color, boxShadow: `0 0 8px ${color}90` }}
                        />
                        <span className={`flex-1 truncate ${active ? "font-semibold" : "text-ink-dim"}`}>
                          {RARITY_RU[rarity]}
                        </span>
                        <span className="text-xs tabular-nums text-ink-faint">{count}</span>
                        {active && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="text-accent">
                            <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Price */}
            <div>
              <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-ink-faint">
                Цена, $
              </h3>
              <div className="flex items-center gap-2">
                <input
                  className="input !py-2 text-sm"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder={bounds ? (bounds.min / 100).toFixed(2) : "от"}
                  value={minD}
                  onChange={(e) => setMinD(e.target.value)}
                  aria-label="Минимальная цена, ₽"
                />
                <span className="text-ink-faint">–</span>
                <input
                  className="input !py-2 text-sm"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder={bounds ? (bounds.max / 100).toFixed(2) : "до"}
                  value={maxD}
                  onChange={(e) => setMaxD(e.target.value)}
                  aria-label="Максимальная цена, ₽"
                />
              </div>
              {bounds && (
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  Диапазон каталога: {formatPrice(bounds.min)} – {formatPrice(bounds.max)}
                </p>
              )}
            </div>

            {/* StatTrak */}
            <button
              type="button"
              role="switch"
              aria-checked={stattrak}
              onClick={() => updateParams({ stattrak: stattrak ? null : "1" })}
              className="flex w-full items-center justify-between rounded-lg px-1 py-1"
            >
              <span className={`text-sm font-semibold ${stattrak ? "text-accent-hot" : "text-ink-dim"}`}>
                Только StatTrak™
              </span>
              <span
                className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                  stattrak ? "border-accent-hot/60 bg-accent-hot/30" : "border-line bg-panel-2"
                }`}
              >
                <span
                  className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all ${
                    stattrak ? "left-6 bg-accent-hot" : "left-1 bg-ink-faint"
                  }`}
                />
              </span>
            </button>

            {/* Reset */}
            <button
              type="button"
              className="btn-ghost w-full !py-2 text-sm"
              onClick={reset}
              disabled={!hasFilters}
            >
              Сбросить
            </button>
          </div>
        </aside>

        {/* ---------- Main ---------- */}
        <div className="min-w-0 flex-1">
          {/* Top bar */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm text-ink-dim">
              {loading && items.length === 0 ? (
                "Загрузка…"
              ) : (
                <>
                  Найдено:{" "}
                  <span className="font-display font-bold text-ink">{total}</span>{" "}
                  {plural(total, "предмет", "предмета", "предметов")}
                </>
              )}
            </p>

            {weapon && (
              <button
                type="button"
                onClick={() => updateParams({ weapon: null })}
                className="flex items-center gap-1.5 rounded-full border border-violet/40 bg-violet/10 px-3 py-1.5 text-xs font-semibold text-violet transition-colors hover:bg-violet/20"
                title="Убрать фильтр по оружию"
              >
                {weapon}
                <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden>
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}

            <button
              type="button"
              className="btn-ghost !px-3.5 !py-2 text-sm md:hidden"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Фильтры
            </button>

            <select
              className="input !w-auto cursor-pointer !py-2 text-sm"
              value={sort}
              onChange={(e) => updateParams({ sort: e.target.value === "popular" ? null : e.target.value })}
              aria-label="Сортировка"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Grid */}
          {loading && items.length === 0 ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : fetchError ? (
            <div className="panel flex flex-col items-center px-6 py-16 text-center">
              {/* Masked background layer, not an <img>: the asset is fully
                  opaque with a near-black backdrop, so screen blending drops it
                  and the radial mask feathers the edges — otherwise a hard
                  black square shows against the panel. */}
              <div
                aria-hidden
                className="h-40 w-40 bg-contain bg-center bg-no-repeat opacity-90"
                style={{
                  backgroundImage: "url(/art/empty-state.webp)",
                  mixBlendMode: "screen",
                  maskImage: "radial-gradient(circle at 50% 50%, #000 54%, transparent 78%)",
                  WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 54%, transparent 78%)",
                }}
              />
              <h2 className="mt-4 font-display text-xl font-bold">Не удалось загрузить каталог</h2>
              <p className="mt-1 max-w-sm text-sm text-ink-dim">
                Проблема с соединением. Проверьте интернет и попробуйте снова.
              </p>
              <button
                type="button"
                className="btn-primary mt-5 !py-2 text-sm"
                onClick={() => {
                  setPageData(null);
                  setFetchError(false);
                  setReloadNonce((n) => n + 1);
                }}
              >
                Повторить
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="panel flex flex-col items-center px-6 py-16 text-center">
              {/* Masked background layer, not an <img>: the asset is fully
                  opaque with a near-black backdrop, so screen blending drops it
                  and the radial mask feathers the edges — otherwise a hard
                  black square shows against the panel. */}
              <div
                aria-hidden
                className="h-40 w-40 bg-contain bg-center bg-no-repeat opacity-90"
                style={{
                  backgroundImage: "url(/art/empty-state.webp)",
                  mixBlendMode: "screen",
                  maskImage: "radial-gradient(circle at 50% 50%, #000 54%, transparent 78%)",
                  WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 54%, transparent 78%)",
                }}
              />
              <h2 className="mt-4 font-display text-xl font-bold">Ничего не найдено</h2>
              <p className="mt-1 max-w-sm text-sm text-ink-dim">
                По вашему запросу нет предметов. Попробуйте изменить фильтры или сбросить их.
              </p>
              <button type="button" className="btn-ghost mt-5 !py-2 text-sm" onClick={reset}>
                Сбросить фильтры
              </button>
            </div>
          ) : (
            <>
              <div
                className={`grid grid-cols-2 gap-4 transition-opacity duration-200 lg:grid-cols-3 xl:grid-cols-4 ${
                  loading ? "pointer-events-none opacity-50" : "opacity-100"
                }`}
              >
                {items.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>

              {items.length < total && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    className="btn-ghost min-w-52"
                    onClick={() => void loadMore()}
                    disabled={loadingMore || loading}
                  >
                    {loadingMore ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Загружаем…
                      </>
                    ) : (
                      <>Показать ещё ({Math.min(PER_PAGE, total - items.length)})</>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
