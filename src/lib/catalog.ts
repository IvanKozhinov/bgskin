// Server-side catalog singleton: loads data/catalog.json once, merges live or
// demo prices (recomputed lazily every 5 min) and answers catalog queries.

import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  CatalogFacets,
  CatalogFilters,
  CatalogItem,
  CatalogResponse,
  RarityId,
} from "@/lib/types";
import { RARITY_META } from "@/lib/types";
import { getLivePriceMapCents } from "@/lib/prices";
import { isSkinsbackLive } from "@/lib/config";

const MERGE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 60;
const FACET_WEAPON_LIMIT = 40;

/** Demo price ranges per rarity, integer cents [min, max]. */
const RARITY_PRICE_RANGE: Record<RarityId, readonly [number, number]> = {
  consumer: [30, 300],
  industrial: [60, 900],
  milspec: [150, 2500],
  restricted: [400, 8000],
  classified: [1500, 30000],
  covert: [4000, 120000],
  contraband: [30000, 250000],
  extraordinary: [8000, 300000],
};

interface SearchEntry {
  hay: string; // lowercased "name weapon"
  hayStripped: string; // same with "|" and "-" removed, whitespace collapsed
}

interface CatalogStore {
  base: CatalogItem[]; // as loaded from disk (priceCents = 0)
  search: SearchEntry[]; // parallel to base
  weaponFacet: CatalogFacets["weapons"]; // static, over full catalog
  rarityFacet: CatalogFacets["rarities"]; // static, over full catalog
  priced: CatalogItem[]; // parallel to base, current prices
  pricedById: Map<string, CatalogItem>;
  facets: CatalogFacets;
  mergedAt: number; // epoch ms of last price merge, 0 = never
  merging: Promise<void> | null; // in-flight merge, shared across callers
}

const g = globalThis as typeof globalThis & { __bgaCatalogStore?: CatalogStore };

/** 32-bit FNV-1a hash. Must stay in sync with scripts/fetch-catalog.ts. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function stripForSearch(s: string): string {
  return s.replace(/[|\-]/g, "").replace(/\s+/g, " ").trim();
}

function loadBaseItems(): CatalogItem[] {
  const dataDir = path.join(process.cwd(), "data");
  for (const file of ["catalog.json", "catalog.seed.json"]) {
    try {
      const parsed: unknown = JSON.parse(
        readFileSync(path.join(dataDir, file), "utf8")
      );
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as CatalogItem[];
      }
    } catch {
      // fall through to the next candidate
    }
  }
  throw new Error(
    "BGASkins: neither data/catalog.json nor data/catalog.seed.json is readable. Run `npx tsx scripts/fetch-catalog.ts`."
  );
}

function buildStore(): CatalogStore {
  const base = loadBaseItems();

  const search: SearchEntry[] = base.map((it) => {
    const hay = `${it.name} ${it.weapon}`.toLowerCase();
    return { hay, hayStripped: stripForSearch(hay) };
  });

  const weaponCounts = new Map<string, number>();
  const rarityCounts = new Map<RarityId, number>();
  for (const it of base) {
    weaponCounts.set(it.weapon, (weaponCounts.get(it.weapon) ?? 0) + 1);
    rarityCounts.set(it.rarity, (rarityCounts.get(it.rarity) ?? 0) + 1);
  }
  const weaponFacet = [...weaponCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, FACET_WEAPON_LIMIT)
    .map(([weapon, count]) => ({ weapon, count }));
  const rarityFacet = (Object.keys(RARITY_META) as RarityId[])
    .filter((r) => rarityCounts.has(r))
    .map((rarity) => ({ rarity, count: rarityCounts.get(rarity) ?? 0 }));

  // Initial prices so the store is usable before the first merge. In demo mode
  // that is the deterministic demo price (buyable). In live mode nothing is
  // buyable until the real Skinsback price list has loaded, so mark items
  // unavailable with a 0 price rather than charging a fabricated demo price.
  const live = isSkinsbackLive();
  const priced = base.map((it) => ({
    ...it,
    priceCents: live ? 0 : demoPriceCents(it),
    available: !live,
  }));

  return {
    base,
    search,
    weaponFacet,
    rarityFacet,
    priced,
    pricedById: new Map(priced.map((it) => [it.id, it])),
    facets: {
      weapons: weaponFacet,
      rarities: rarityFacet,
      priceBoundsCents: priceBounds(priced),
    },
    mergedAt: 0,
    merging: null,
  };
}

function getStore(): CatalogStore {
  if (!g.__bgaCatalogStore) g.__bgaCatalogStore = buildStore();
  return g.__bgaCatalogStore;
}

/**
 * Deterministic demo price: FNV-1a of the id picks a point on a log scale
 * inside the rarity's range, then wobbles ±3% on a 10-minute clock.
 */
function demoPriceCents(item: CatalogItem): number {
  const [min, max] = RARITY_PRICE_RANGE[item.rarity] ?? RARITY_PRICE_RANGE.consumer;
  const h = fnv1a(item.id);
  const t = h / 0xffffffff;
  const base = min * Math.pow(max / min, t);
  const wobble = 1 + 0.03 * Math.sin(h + Math.floor(Date.now() / 600_000));
  return Math.max(1, Math.round(base * wobble));
}

/**
 * Collapse the live price map (keys are full market hash names, possibly with
 * a wear suffix) into base-name -> min price. A live key contributes to every
 * name it could match under the rule "key === name || key starts with
 * name + ' ('"; StatTrak / Souvenir listings are ignored.
 */
function buildBasePriceMap(live: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, price] of live) {
    if (!Number.isFinite(price) || price <= 0) continue;
    if (key.includes("StatTrak") || key.includes("Souvenir")) continue;
    const cents = Math.round(price);
    const put = (name: string) => {
      const prev = out.get(name);
      if (prev === undefined || cents < prev) out.set(name, cents);
    };
    put(key);
    for (let i = key.indexOf(" ("); i !== -1; i = key.indexOf(" (", i + 1)) {
      put(key.slice(0, i));
    }
  }
  return out;
}

function priceBounds(items: CatalogItem[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let n = 0;
  for (const it of items) {
    if (it.available === false) continue; // ignore unpriced/unavailable items
    n++;
    if (it.priceCents < min) min = it.priceCents;
    if (it.priceCents > max) max = it.priceCents;
  }
  return n > 0 ? { min, max } : { min: 0, max: 0 };
}

async function recomputePrices(store: CatalogStore): Promise<void> {
  const live = isSkinsbackLive();
  let liveMap: Map<string, number> | null = null;
  try {
    liveMap = await getLivePriceMapCents();
  } catch {
    liveMap = null;
  }

  // Live mode with the provider unreachable: keep the last known prices instead
  // of repricing the entire catalog with fabricated demo numbers. Bump the
  // timestamp so the next request retries the refresh.
  if (live && liveMap === null) {
    store.mergedAt = Date.now();
    return;
  }

  const baseMap = liveMap ? buildBasePriceMap(liveMap) : null;

  const priced = store.base.map((it) => {
    if (baseMap) {
      // Live mode: only items present in the Skinsback price list are buyable.
      const p = baseMap.get(it.name);
      return { ...it, priceCents: p ?? 0, available: p !== undefined };
    }
    // Demo mode: deterministic demo price, everything buyable.
    return { ...it, priceCents: demoPriceCents(it), available: true };
  });

  store.priced = priced;
  store.pricedById = new Map(priced.map((it) => [it.id, it]));
  store.facets = {
    weapons: store.weaponFacet,
    rarities: store.rarityFacet,
    priceBoundsCents: priceBounds(priced),
  };
  store.mergedAt = Date.now();
}

/** Ensure prices are at most MERGE_TTL_MS old; concurrent callers share one merge. */
async function ensureFresh(): Promise<CatalogStore> {
  const store = getStore();
  if (Date.now() - store.mergedAt < MERGE_TTL_MS) return store;
  if (!store.merging) {
    store.merging = recomputePrices(store).finally(() => {
      store.merging = null;
    });
  }
  await store.merging;
  return store;
}

export async function getAllItems(): Promise<CatalogItem[]> {
  const store = await ensureFresh();
  // Only buyable items — consumers are the fake feed and "hot items" showcase.
  return store.priced.filter((it) => it.available !== false);
}

export async function getItemById(id: string): Promise<CatalogItem | null> {
  const store = await ensureFresh();
  return store.pricedById.get(id) ?? null;
}

export async function queryCatalog(f: CatalogFilters): Promise<CatalogResponse> {
  const store = await ensureFresh();

  const q = f.q?.trim().toLowerCase() ?? "";
  const qStripped = q ? stripForSearch(q) : "";
  const weapon = f.weapon?.trim().toLowerCase();
  const raritySet =
    f.rarity && f.rarity.length > 0 ? new Set<RarityId>(f.rarity) : null;

  const matched: CatalogItem[] = [];
  for (let i = 0; i < store.priced.length; i++) {
    const it = store.priced[i];
    if (it.available === false) continue; // hide items with no live price
    if (f.category && it.category !== f.category) continue;
    if (weapon && it.weapon.toLowerCase() !== weapon) continue;
    if (raritySet && !raritySet.has(it.rarity)) continue;
    if (typeof f.stattrak === "boolean" && it.stattrak !== f.stattrak) continue;
    if (f.minPriceCents !== undefined && it.priceCents < f.minPriceCents) continue;
    if (f.maxPriceCents !== undefined && it.priceCents > f.maxPriceCents) continue;
    if (q) {
      const s = store.search[i];
      if (!s.hay.includes(q) && !(qStripped && s.hayStripped.includes(qStripped))) {
        continue;
      }
    }
    matched.push(it);
  }

  const sort = f.sort ?? "popular";
  switch (sort) {
    case "price_asc":
      matched.sort((a, b) => a.priceCents - b.priceCents || a.name.localeCompare(b.name));
      break;
    case "price_desc":
      matched.sort((a, b) => b.priceCents - a.priceCents || a.name.localeCompare(b.name));
      break;
    case "name":
      matched.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "popular":
    default:
      matched.sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
      break;
  }

  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Math.floor(f.perPage ?? DEFAULT_PER_PAGE))
  );
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const start = (page - 1) * perPage;

  return {
    items: matched.slice(start, start + perPage),
    total: matched.length,
    page,
    perPage,
    facets: store.facets,
  };
}
