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
import { getLiveOffers, type SbOffer } from "@/lib/prices";
import { getPricingConfig, retailCents } from "@/lib/pricing";
import { usdToRub, usdCentsToRubKopecks } from "@/lib/currency";
import { isSkinsbackLive } from "@/lib/settings";

const MERGE_TTL_MS = 5 * 60 * 1000;
/** How soon to retry when the catalogue has no prices at all yet. */
const RETRY_WHEN_EMPTY_MS = 20 * 1000;
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
  baseSearch: SearchEntry[]; // parallel to base
  search: SearchEntry[]; // parallel to `priced` (base entries + Skinsback-only ones)
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

function searchEntry(it: CatalogItem): SearchEntry {
  const hay = `${it.name} ${it.weapon}`.toLowerCase();
  return { hay, hayStripped: stripForSearch(hay) };
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
    "BGSkins: neither data/catalog.json nor data/catalog.seed.json is readable. Run `npx tsx scripts/fetch-catalog.ts`."
  );
}

function buildStore(): CatalogStore {
  const base = loadBaseItems();

  const search: SearchEntry[] = base.map(searchEntry);

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
    baseSearch: search,
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
function buildBasePriceMap(live: Map<string, SbOffer>): Map<string, SbOffer> {
  const out = new Map<string, SbOffer>();
  for (const [key, offer] of live) {
    const cents = Math.round(offer.costCents);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    const put = (name: string) => {
      const prev = out.get(name);
      if (!prev) {
        out.set(name, { costCents: cents, count: offer.count, name: key });
        return;
      }
      // Cheapest variant sets both the price and the listing we will buy;
      // stock adds up across wears.
      const cheaper = cents < prev.costCents;
      out.set(name, {
        costCents: cheaper ? cents : prev.costCents,
        count: prev.count + offer.count,
        name: cheaper ? key : prev.name,
      });
    };
    put(key);
    // Collapse ONLY a real wear suffix. Splitting on every " (" invented names
    // like "Sticker | Foo" out of "Sticker | Foo (Holo)" — listings that don't
    // exist at Skinsback and therefore can never be bought.
    const base = key.replace(WEAR_SUFFIX, "");
    if (base !== key) put(base);
  }
  return out;
}

const WEAR_SUFFIX =
  /\s\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

/** Guess a category from a Skinsback market name we have no metadata for. */
function guessCategory(name: string, weapon: string): CatalogItem["category"] {
  const n = name.toLowerCase();
  if (n.startsWith("★") && n.includes("gloves")) return "gloves";
  if (n.startsWith("★") || /knife|bayonet|karambit|daggers/.test(n)) return "knife";
  const w = weapon.toLowerCase();
  if (/^(glock|usp|p2000|p250|five-seven|tec-9|cz75|dual berettas|desert eagle|r8)/.test(w))
    return "pistol";
  if (/^(ak-47|m4a4|m4a1|aug|sg 553|famas|galil|ssg 08|awp|scar-20|g3sg1)/.test(w)) return "rifle";
  if (/^(mac-10|mp9|mp7|mp5|ump-45|p90|pp-bizon)/.test(w)) return "smg";
  if (/^(nova|xm1014|mag-7|sawed-off|m249|negev)/.test(w)) return "heavy";
  return "other";
}

/**
 * Build a storefront item for a Skinsback offer we have no local metadata for
 * (cases, stickers, agents, patches, music kits …). No image is available, so
 * the card falls back to the neutral placeholder.
 */
const VARIANT_PREFIX = /^(StatTrak™?\s*|Souvenir\s+|★\s*StatTrak™?\s*)/;

/**
 * Metadata donor for a StatTrak/Souvenir listing: "StatTrak™ AK-47 | Redline"
 * shares artwork and rarity with the plain skin, so the card looks right
 * instead of falling back to a blank placeholder.
 */
function donorName(name: string): string | null {
  if (!VARIANT_PREFIX.test(name)) return null;
  const stripped = name.replace(/^★\s*/, "").replace(/^(StatTrak™?\s*|Souvenir\s+)/, "");
  return name.startsWith("★") ? `★ ${stripped}` : stripped;
}

function itemFromOfferName(
  name: string,
  offer: SbOffer,
  priceCents: number,
  donor?: CatalogItem,
): CatalogItem {
  const weapon = name.includes(" | ") ? name.split(" | ")[0].replace(/^★\s*/, "").trim() : "";
  const isStatTrak = /StatTrak/.test(name);
  return {
    id: `sb-${fnv1a(name).toString(36)}-${name.length.toString(36)}`,
    name,
    weapon: donor?.weapon ?? weapon.replace(/^(StatTrak™?|Souvenir)\s*/, "") ?? "Прочее",
    category: donor?.category ?? guessCategory(name, weapon),
    rarity: donor?.rarity ?? "milspec",
    image: donor?.image ?? "",
    minFloat: donor?.minFloat ?? 0,
    maxFloat: donor?.maxFloat ?? 1,
    stattrak: isStatTrak,
    souvenir: /Souvenir/.test(name),
    kind: donor?.kind ?? "skin",
    priceCents,
    costCents: offer.costCents,
    stock: offer.count,
    sourceName: offer.name ?? name,
    popularity: donor ? Math.max(0, donor.popularity - 5) : 0,
    available: true,
  };
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
  let liveMap: Map<string, SbOffer> | null = null;
  try {
    liveMap = await getLiveOffers();
  } catch {
    liveMap = null;
  }

  // Live mode with the provider unreachable: keep the last known prices instead
  // of repricing the entire catalog with fabricated demo numbers. Bump the
  // timestamp so the next request retries the refresh.
  if (live && liveMap === null) {
    // Provider unreachable. If we already had prices, keep them for a full TTL.
    // If we never had any, the storefront is EMPTY — retry soon instead of
    // leaving customers with a blank shop for the whole merge window.
    const hasPrices = store.priced.some((it) => it.available !== false);
    store.mergedAt = hasPrices ? Date.now() : Date.now() - MERGE_TTL_MS + RETRY_WHEN_EMPTY_MS;
    return;
  }

  const baseMap = liveMap ? buildBasePriceMap(liveMap) : null;
  const cfg = getPricingConfig();
  // Skinsback quotes USD; the storefront sells in roubles.
  const rate = await usdToRub();
  const retail = (costUsdCents: number) => retailCents(usdCentsToRubKopecks(costUsdCents, rate), cfg);

  const priced: CatalogItem[] = store.base.map((it) => {
    if (baseMap) {
      // Live mode: stock comes from Skinsback, the shown price adds our markup.
      const offer = baseMap.get(it.name);
      const inStock = offer !== undefined && offer.count > 0;
      return {
        ...it,
        priceCents: offer ? retail(offer.costCents) : 0,
        costCents: offer?.costCents,
        stock: offer?.count,
        sourceName: offer?.name,
        available: inStock,
      };
    }
    // Demo mode: deterministic demo cost, marked up the same way so the
    // storefront shows exactly the arithmetic live mode will use. Non-skin
    // inventory stays hidden until Skinsback quotes it for real.
    const cost = demoPriceCents(it);
    return {
      ...it,
      priceCents: retail(cost),
      costCents: cost,
      stock: undefined,
      available: it.kind !== "extra",
    };
  });

  // Everything Skinsback stocks that our metadata does not cover (cases,
  // stickers, agents …) still belongs in the storefront.
  if (baseMap) {
    const known = new Map(store.base.map((it) => [it.name, it]));
    for (const [name, offer] of baseMap) {
      if (known.has(name) || WEAR_SUFFIX.test(name) || offer.count <= 0) continue;
      const price = retail(offer.costCents);
      if (price <= 0) continue;
      // StatTrak/Souvenir listings borrow artwork from the plain skin.
      const donor = known.get(donorName(name) ?? "");
      priced.push(itemFromOfferName(name, offer, price, donor));
    }
  }

  store.priced = priced;
  // Keep the search index aligned with `priced`: base entries are reused, the
  // Skinsback-only tail gets fresh entries.
  store.search =
    priced.length === store.baseSearch.length
      ? store.baseSearch
      : [...store.baseSearch, ...priced.slice(store.baseSearch.length).map(searchEntry)];
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

/**
 * Strip fields that must never reach a browser. `costCents` is what we pay
 * Skinsback — publishing it hands every visitor our margin.
 */
function toPublic(it: CatalogItem): CatalogItem {
  if (it.costCents === undefined) return it;
  const { costCents: _cost, ...rest } = it;
  void _cost;
  return rest;
}

export async function getAllItems(): Promise<CatalogItem[]> {
  const store = await ensureFresh();
  // Only buyable items — consumers are the live feed and "hot items" showcase.
  return store.priced.filter((it) => it.available !== false).map(toPublic);
}

/** Public lookup: safe to serialise into a page or an API response. */
export async function getItemById(id: string): Promise<CatalogItem | null> {
  const item = await getItemForPurchase(id);
  return item ? toPublic(item) : null;
}

/**
 * Server-only lookup that keeps `costCents`. Used by the buy route to cap what
 * we are willing to pay Skinsback. Never serialise the result to a client.
 */
export async function getItemForPurchase(id: string): Promise<CatalogItem | null> {
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
    items: matched.slice(start, start + perPage).map(toPublic),
    total: matched.length,
    page,
    perPage,
    facets: store.facets,
  };
}
