// Live price provider: Skinsback price list cached in a globalThis singleton,
// lazily refreshed every 10 minutes. Never throws — on fetch failure the stale
// map is kept and a warning is logged.

import { isSkinsbackLive } from "./settings";
import { sbPricelist } from "./skinsback";

const TTL_MS = 10 * 60 * 1000;
const ERROR_RETRY_MS = 60 * 1000;

/** What Skinsback charges us for one market name, plus how many they hold. */
export interface SbOffer {
  costCents: number;
  count: number;
  /** Full market name of the cheapest listing (with wear suffix). */
  name?: string;
}

interface PriceCacheState {
  /** market name → Skinsback cost in integer cents USD (what WE pay) */
  map: Map<string, number> | null;
  /** market name → cost + stock, same freshness as `map` */
  offers: Map<string, SbOffer> | null;
  fetchedAt: number;
  lastErrorAt: number;
  inflight: Promise<void> | null;
}

const globalForPrices = globalThis as unknown as { __bgaPrices?: PriceCacheState };

function state(): PriceCacheState {
  if (!globalForPrices.__bgaPrices) {
    globalForPrices.__bgaPrices = {
      map: null,
      offers: null,
      fetchedAt: 0,
      lastErrorAt: 0,
      inflight: null,
    };
  }
  return globalForPrices.__bgaPrices;
}

async function refresh(s: PriceCacheState): Promise<void> {
  try {
    // One immediate retry: a single slow response should not blank the shop.
    let items: Awaited<ReturnType<typeof sbPricelist>>["items"];
    try {
      ({ items } = await sbPricelist());
    } catch (first) {
      console.warn("[prices] pricelist attempt 1 failed, retrying once:", first);
      ({ items } = await sbPricelist());
    }
    const map = new Map<string, number>();
    const offers = new Map<string, SbOffer>();
    for (const item of items) {
      if (!item.name || !Number.isFinite(item.price)) continue;
      const costCents = Math.round(item.price * 100);
      // The grouped pricelist returns one row per name; keep the cheapest if a
      // name ever repeats, and treat a missing count as "at least one".
      const prev = offers.get(item.name);
      // Absent count = unknown, assume one is available. An explicit 0 means
      // out of stock and stays 0 so the catalog can hide it.
      const count =
        item.count === undefined || !Number.isFinite(item.count)
          ? 1
          : Math.max(0, Math.round(item.count));
      if (!prev || costCents < prev.costCents) {
        map.set(item.name, costCents);
        offers.set(item.name, { costCents, count, name: item.name });
      } else {
        offers.set(item.name, { costCents: prev.costCents, count: prev.count + count, name: prev.name });
      }
    }
    s.map = map;
    s.offers = offers;
    s.fetchedAt = Date.now();
  } catch (err) {
    // Keep whatever we had; retry after a short backoff.
    s.lastErrorAt = Date.now();
    console.warn("[prices] Skinsback pricelist refresh failed, keeping stale prices:", err);
  }
}

/**
 * Live price map (market name → integer cents USD), or null when Skinsback
 * keys are absent (demo mode) or the very first fetch has failed.
 * Stale-while-revalidate: an expired map is returned immediately while a
 * single background refresh runs. Never throws.
 */
export async function getLivePriceMapCents(): Promise<Map<string, number> | null> {
  return (await ensureOffers())?.map ?? null;
}

/** Same freshness as {@link getLivePriceMapCents}, with stock counts. */
export async function getLiveOffers(): Promise<Map<string, SbOffer> | null> {
  return (await ensureOffers())?.offers ?? null;
}

/** Epoch ms of the last successful pricelist fetch (0 = never). */
export function pricesFetchedAt(): number {
  return state().fetchedAt;
}

async function ensureOffers(): Promise<PriceCacheState | null> {
  if (!isSkinsbackLive()) return null;
  const s = state();
  const now = Date.now();
  const fresh = s.map !== null && now - s.fetchedAt < TTL_MS;
  const inErrorBackoff = now - s.lastErrorAt < ERROR_RETRY_MS;

  if (!fresh && !inErrorBackoff) {
    if (!s.inflight) {
      s.inflight = refresh(s).finally(() => {
        s.inflight = null;
      });
    }
    // No data at all yet — wait for the first fetch; otherwise serve stale.
    if (s.map === null) await s.inflight;
  }

  return s;
}
