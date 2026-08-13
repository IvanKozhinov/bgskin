// Live-feed configuration: defaults + persistence. The feed generator reads
// getFeedConfig() so admin changes take effect without a restart.

import { getFeedConfigJson, setFeedConfigJson } from "./db";
import { FEED_NICKS } from "./nicks";
import type { FeedConfig } from "./types";

// 1000-entry generated pool (src/lib/nicks.ts). Editable in the admin panel.
const DEFAULT_NICKS: string[] = [...FEED_NICKS];

export const DEFAULT_FEED_CONFIG: FeedConfig = {
  enabled: true,
  minIntervalMs: 2500,
  maxIntervalMs: 9000,
  backlogSize: 25,
  ringSize: 60,
  maskNicks: true,
  cheapBias: 0.7,
  cheapThresholdCents: 5000,
  minPriceCents: 0,
  maxPriceCents: 0,
  nicks: DEFAULT_NICKS,
};

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function getFeedConfig(): FeedConfig {
  let stored: Partial<FeedConfig> = {};
  try {
    stored = JSON.parse(getFeedConfigJson()) as Partial<FeedConfig>;
  } catch {
    stored = {};
  }
  const nicks =
    Array.isArray(stored.nicks) && stored.nicks.length > 0
      ? stored.nicks.filter((n) => typeof n === "string" && n.trim()).map((n) => n.trim())
      : DEFAULT_FEED_CONFIG.nicks;
  const minI = clampInt(stored.minIntervalMs, 500, 120000, DEFAULT_FEED_CONFIG.minIntervalMs);
  const maxI = clampInt(stored.maxIntervalMs, minI, 300000, DEFAULT_FEED_CONFIG.maxIntervalMs);
  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_FEED_CONFIG.enabled,
    minIntervalMs: minI,
    maxIntervalMs: maxI,
    backlogSize: clampInt(stored.backlogSize, 0, 60, DEFAULT_FEED_CONFIG.backlogSize),
    ringSize: clampInt(stored.ringSize, 10, 200, DEFAULT_FEED_CONFIG.ringSize),
    maskNicks:
      typeof stored.maskNicks === "boolean" ? stored.maskNicks : DEFAULT_FEED_CONFIG.maskNicks,
    cheapBias: Math.min(1, Math.max(0, typeof stored.cheapBias === "number" ? stored.cheapBias : DEFAULT_FEED_CONFIG.cheapBias)),
    cheapThresholdCents: clampInt(stored.cheapThresholdCents, 0, 100_000_00, DEFAULT_FEED_CONFIG.cheapThresholdCents),
    minPriceCents: clampInt(stored.minPriceCents, 0, 100_000_00, 0),
    maxPriceCents: clampInt(stored.maxPriceCents, 0, 100_000_00, 0),
    nicks,
  };
}

export function setFeedConfig(patch: Partial<FeedConfig>): FeedConfig {
  const merged: Partial<FeedConfig> = { ...getFeedConfig(), ...patch };
  // Don't persist a copy of the default pool on every save — store the nick
  // list only when the admin actually customised it, so the shipped default
  // (src/lib/nicks.ts) stays the source of truth and the row stays small.
  const nicks = merged.nicks;
  if (
    Array.isArray(nicks) &&
    nicks.length === DEFAULT_FEED_CONFIG.nicks.length &&
    nicks.every((n, i) => n === DEFAULT_FEED_CONFIG.nicks[i])
  ) {
    delete merged.nicks;
  }
  // Re-validate through getFeedConfig's clamping by round-tripping.
  setFeedConfigJson(JSON.stringify(merged));
  return getFeedConfig();
}
