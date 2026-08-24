// Shop pricing: the single place where a Skinsback cost becomes a buyer price.
//
// Skinsback quotes what WE pay for a skin. The storefront sells above that:
//   buyer = cost * (1 + percent/100), at least `minMarkupCents` above cost,
//   rounded up to `roundToCents`.
// Cheap skins need a fatter percentage than expensive ones (a flat 10% on a
// $0.30 skin is 3 cents, which fees eat), hence the optional tiers.

import { getPricingConfigJson, setPricingConfigJson } from "./db";
import type { PricingConfig } from "./types";

// All amounts are roubles in kopecks (the shop's currency).
export const DEFAULT_PRICING: PricingConfig = {
  markupPercent: 10,
  tiers: [
    { uptoCents: 10_000, percent: 40 }, // ≤ 100 ₽
    { uptoCents: 50_000, percent: 25 }, // ≤ 500 ₽
    { uptoCents: 500_000, percent: 15 }, // ≤ 5 000 ₽
  ],
  minMarkupCents: 300, // 3 ₽
  roundToCents: 100, // round up to the whole rouble
  maxSlippagePercent: 7,
};

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseTiers(raw: unknown): PricingConfig["tiers"] {
  if (!Array.isArray(raw)) return DEFAULT_PRICING.tiers;
  const tiers: PricingConfig["tiers"] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const uptoCents = Math.round(clampNum(e.uptoCents, 1, 100_000_000, 0));
    const percent = clampNum(e.percent, 0, 1000, -1);
    if (uptoCents <= 0 || percent < 0) continue;
    tiers.push({ uptoCents, percent });
  }
  // Ascending by threshold so the first match is the tightest bracket.
  tiers.sort((a, b) => a.uptoCents - b.uptoCents);
  return tiers.slice(0, 12);
}

export function getPricingConfig(): PricingConfig {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(getPricingConfigJson());
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      stored = parsed as Record<string, unknown>;
    }
  } catch {
    // malformed row — fall back to defaults
  }
  return {
    markupPercent: clampNum(stored.markupPercent, 0, 1000, DEFAULT_PRICING.markupPercent),
    tiers: "tiers" in stored ? parseTiers(stored.tiers) : DEFAULT_PRICING.tiers,
    minMarkupCents: Math.round(
      clampNum(stored.minMarkupCents, 0, 100_000, DEFAULT_PRICING.minMarkupCents),
    ),
    roundToCents: Math.round(clampNum(stored.roundToCents, 1, 10_000, DEFAULT_PRICING.roundToCents)),
    maxSlippagePercent: clampNum(
      stored.maxSlippagePercent,
      0,
      100,
      DEFAULT_PRICING.maxSlippagePercent,
    ),
  };
}

export function setPricingConfig(patch: Partial<PricingConfig>): PricingConfig {
  setPricingConfigJson(JSON.stringify({ ...getPricingConfig(), ...patch }));
  return getPricingConfig();
}

/** Markup percentage that applies to a given Skinsback cost. */
export function markupPercentFor(costCents: number, cfg: PricingConfig): number {
  for (const tier of cfg.tiers) {
    if (costCents <= tier.uptoCents) return tier.percent;
  }
  return cfg.markupPercent;
}

/**
 * Buyer price for a Skinsback cost, in integer cents.
 * Returns 0 for a non-positive cost so callers can treat it as "unavailable".
 */
function rawRetail(cost: number, cfg: PricingConfig): number {
  const percent = markupPercentFor(cost, cfg);
  const withPercent = cost * (1 + percent / 100);
  const withFloor = Math.max(withPercent, cost + cfg.minMarkupCents);
  const step = Math.max(1, Math.round(cfg.roundToCents));
  // Snap off float dust before rounding up: 50000 * 1.1 is 55000.000000000007
  // in IEEE-754, and a bare ceil() would turn $550.00 into $550.01.
  const exact = Math.round(withFloor * 1e6) / 1e6;
  return Math.ceil(exact / step) * step;
}

export function retailCents(costCents: number, cfg: PricingConfig): number {
  if (!Number.isFinite(costCents) || costCents <= 0) return 0;
  const cost = Math.round(costCents);
  let price = rawRetail(cost, cfg);
  // Keep the curve monotonic: crossing a tier boundary drops the percentage, so
  // a plain lookup would price a $1.01 skin below a $1.00 one. Never sell below
  // what the previous (fatter) bracket charged at its own ceiling.
  for (const tier of cfg.tiers) {
    if (tier.uptoCents < cost) price = Math.max(price, rawRetail(tier.uptoCents, cfg));
  }
  return price;
}

/**
 * Highest cost we still accept when actually buying from Skinsback. Derived
 * from the COST, never from the buyer price — otherwise the whole markup would
 * be handed back as allowed slippage.
 *
 * Hard ceiling: never above what the buyer actually paid. With a generous
 * slippage setting (say 15%) and a thin margin (10%) the raw allowance would
 * exceed the sale price and every accepted slip would be a loss.
 */
export function maxAcceptableCostCents(
  costCents: number,
  cfg: PricingConfig,
  buyerPaidCents?: number,
): number {
  const cost = Math.max(0, Math.round(costCents));
  const allowance = Math.ceil(cost * (1 + cfg.maxSlippagePercent / 100));
  if (buyerPaidCents === undefined || !Number.isFinite(buyerPaidCents)) return allowance;
  return Math.min(allowance, Math.max(cost, Math.round(buyerPaidCents)));
}
