// Currency: the shop sells in roubles, Skinsback quotes in US dollars.
//
// The rate comes from Skinsback itself (`currencies`), so the price a customer
// pays is derived from the same number the provider uses to charge us — no
// third-party feed can drift away from our actual cost basis.

import { isSkinsbackLive } from "./settings";
import { sbCurrencyRate } from "./skinsback";

/** Used until the first successful fetch, and if the provider is unreachable. */
const FALLBACK_USD_RUB = 90;
const TTL_MS = 60 * 60 * 1000; // rates move slowly; hourly is plenty
const ERROR_RETRY_MS = 5 * 60 * 1000;

interface RateState {
  rate: number | null;
  fetchedAt: number;
  lastErrorAt: number;
  inflight: Promise<void> | null;
}

const g = globalThis as typeof globalThis & { __bgaRate?: RateState };

function state(): RateState {
  if (!g.__bgaRate) g.__bgaRate = { rate: null, fetchedAt: 0, lastErrorAt: 0, inflight: null };
  return g.__bgaRate;
}

async function refresh(s: RateState): Promise<void> {
  try {
    const rate = await sbCurrencyRate("rub");
    // Guard against a nonsense value silently repricing the whole catalogue.
    if (Number.isFinite(rate) && rate > 10 && rate < 1000) {
      s.rate = rate;
      s.fetchedAt = Date.now();
    } else {
      throw new Error(`implausible USD/RUB rate: ${rate}`);
    }
  } catch (err) {
    s.lastErrorAt = Date.now();
    console.warn("[currency] USD/RUB refresh failed, keeping previous rate:", err);
  }
}

/**
 * Current USD→RUB rate. Never throws: falls back to the last known value, then
 * to FALLBACK_USD_RUB. Stale-while-revalidate, like the price list.
 */
export async function usdToRub(): Promise<number> {
  if (!isSkinsbackLive()) return state().rate ?? FALLBACK_USD_RUB;
  const s = state();
  const now = Date.now();
  const fresh = s.rate !== null && now - s.fetchedAt < TTL_MS;
  const inBackoff = now - s.lastErrorAt < ERROR_RETRY_MS;

  if (!fresh && !inBackoff) {
    if (!s.inflight) {
      s.inflight = refresh(s).finally(() => {
        s.inflight = null;
      });
    }
    if (s.rate === null) await s.inflight;
  }
  return s.rate ?? FALLBACK_USD_RUB;
}

/** Synchronous read of the cached rate — for code paths that cannot await. */
export function cachedUsdToRub(): number {
  return state().rate ?? FALLBACK_USD_RUB;
}

/** US cents → roubles, in kopecks. */
export function usdCentsToRubKopecks(usdCents: number, rate: number): number {
  if (!Number.isFinite(usdCents) || usdCents <= 0) return 0;
  return Math.round(usdCents * rate);
}

/** Roubles (kopecks) → US cents, for capping what we pay the provider. */
export function rubKopecksToUsdCents(kopecks: number, rate: number): number {
  if (!Number.isFinite(kopecks) || kopecks <= 0 || rate <= 0) return 0;
  return Math.round(kopecks / rate);
}
