// Live price provider: Skinsback price list cached in a globalThis singleton,
// lazily refreshed every 10 minutes. Never throws — on fetch failure the stale
// map is kept and a warning is logged.

import { isSkinsbackLive } from "./config";
import { sbPricelist } from "./skinsback";

const TTL_MS = 10 * 60 * 1000;
const ERROR_RETRY_MS = 60 * 1000;

interface PriceCacheState {
  /** market name → price in integer cents USD */
  map: Map<string, number> | null;
  fetchedAt: number;
  lastErrorAt: number;
  inflight: Promise<void> | null;
}

const globalForPrices = globalThis as unknown as { __bgaPrices?: PriceCacheState };

function state(): PriceCacheState {
  if (!globalForPrices.__bgaPrices) {
    globalForPrices.__bgaPrices = { map: null, fetchedAt: 0, lastErrorAt: 0, inflight: null };
  }
  return globalForPrices.__bgaPrices;
}

async function refresh(s: PriceCacheState): Promise<void> {
  try {
    const { items } = await sbPricelist();
    const map = new Map<string, number>();
    for (const item of items) {
      if (!item.name || !Number.isFinite(item.price)) continue;
      map.set(item.name, Math.round(item.price * 100));
    }
    s.map = map;
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

  return s.map;
}
