// Live purchase feed. A globalThis singleton generates purchase events from real
// catalog items on a configurable cadence, keeps a ring buffer and fans events
// out to SSE subscribers. All behaviour (cadence, nick pool, masking, price
// filters, on/off) is driven by the admin-editable config in feedcfg.ts, read
// fresh on every tick so changes apply without a restart.

import { getAllItems } from "@/lib/catalog";
import { getFeedConfig } from "@/lib/feedcfg";
import type { CatalogItem, FeedEvent } from "@/lib/types";

const SEED_SPAN_MS = 20 * 60 * 1000; // seed events are backdated over the last 20 min
const FALLBACK_PRICE_CENTS = 500; // guard: prices may be 0 before the price merge

interface FeedState {
  /** Ring buffer, oldest → newest. */
  buffer: FeedEvent[];
  subscribers: Set<(e: FeedEvent) => void>;
  timer: ReturnType<typeof setTimeout> | null;
  items: CatalogItem[];
  initPromise: Promise<void> | null;
}

const g = globalThis as typeof globalThis & { __bgaskinsFeed?: FeedState };

function getState(): FeedState {
  if (!g.__bgaskinsFeed) {
    g.__bgaskinsFeed = {
      buffer: [],
      subscribers: new Set(),
      timer: null,
      items: [],
      initPromise: null,
    };
  }
  return g.__bgaskinsFeed;
}

/** Partially mask a nickname the way real marketplaces do: "S1mpleKiller" → "S1m***ller". */
function maskNick(nick: string): string {
  if (nick.length > 9) return `${nick.slice(0, 3)}***${nick.slice(-4)}`;
  return `${nick.slice(0, 2)}***`;
}

function effectivePrice(item: CatalogItem): number {
  return item.priceCents > 0 ? item.priceCents : FALLBACK_PRICE_CENTS;
}

/** Random item, weighted toward cheaper and more popular items, per config. */
function pickItem(items: CatalogItem[]): CatalogItem {
  const cfg = getFeedConfig();
  let pool = items;
  if (cfg.minPriceCents > 0 || cfg.maxPriceCents > 0) {
    const filtered = items.filter((i) => {
      const p = effectivePrice(i);
      if (cfg.minPriceCents > 0 && p < cfg.minPriceCents) return false;
      if (cfg.maxPriceCents > 0 && p > cfg.maxPriceCents) return false;
      return true;
    });
    if (filtered.length > 0) pool = filtered;
  }
  const cheap = pool.filter((i) => effectivePrice(i) < cfg.cheapThresholdCents);
  const usePool = cheap.length > 0 && Math.random() < cfg.cheapBias ? cheap : pool;
  // Popularity bias: draw two candidates, keep the more popular one.
  const a = usePool[Math.floor(Math.random() * usePool.length)];
  const b = usePool[Math.floor(Math.random() * usePool.length)];
  return b.popularity > a.popularity ? b : a;
}

function makeEvent(item: CatalogItem, ts: number): FeedEvent {
  const cfg = getFeedConfig();
  const nicks = cfg.nicks.length > 0 ? cfg.nicks : ["Player"];
  const raw = nicks[Math.floor(Math.random() * nicks.length)];
  return {
    id: crypto.randomUUID(),
    kind: "purchase",
    buyer: cfg.maskNicks ? maskNick(raw) : raw,
    itemId: item.id,
    itemName: item.name,
    weapon: item.weapon,
    rarity: item.rarity,
    image: item.image,
    priceCents: effectivePrice(item),
    ts,
  };
}

function pushEvent(state: FeedState, e: FeedEvent): void {
  const ring = getFeedConfig().ringSize;
  state.buffer.push(e);
  if (state.buffer.length > ring) {
    state.buffer.splice(0, state.buffer.length - ring);
  }
  for (const cb of state.subscribers) {
    try {
      cb(e);
    } catch {
      // a broken subscriber must never kill the generator loop
    }
  }
}

/** Pre-fill the buffer with backdated events so the UI is full immediately. */
function seedBuffer(state: FeedState): void {
  const now = Date.now();
  const count = getFeedConfig().backlogSize;
  const offsets = Array.from({ length: count }, () => Math.random() * SEED_SPAN_MS).sort(
    (a, b) => b - a,
  ); // descending offset → ascending timestamps (oldest first)
  for (const offset of offsets) {
    state.buffer.push(makeEvent(pickItem(state.items), now - offset));
  }
}

function scheduleNext(state: FeedState): void {
  // The handle lives on globalThis: clearing before re-creating guarantees a
  // single timer chain even across dev HMR module reloads.
  if (state.timer) clearTimeout(state.timer);
  const cfg = getFeedConfig();
  const delay = cfg.minIntervalMs + Math.random() * (cfg.maxIntervalMs - cfg.minIntervalMs);
  const handle = setTimeout(() => {
    // Emit only when enabled — a disabled feed keeps its buffer but goes quiet.
    if (getFeedConfig().enabled && state.items.length > 0) {
      pushEvent(state, makeEvent(pickItem(state.items), Date.now()));
    }
    scheduleNext(state);
  }, delay);
  if (typeof handle === "object" && handle !== null && "unref" in handle) {
    handle.unref(); // never keep the process alive just for the live feed
  }
  state.timer = handle;
}

async function init(state: FeedState): Promise<void> {
  const items = await getAllItems();
  state.items = items.filter((i) => i.image !== "" && i.name !== "");
  if (state.items.length === 0) {
    // Catalog not ready yet — reset so a later access retries initialization.
    state.initPromise = null;
    return;
  }
  if (state.buffer.length === 0) seedBuffer(state);
  scheduleNext(state);
}

function ensureStarted(): FeedState {
  const state = getState();
  if (!state.initPromise) {
    state.initPromise = init(state).catch((err: unknown) => {
      console.error("[feed] init failed:", err);
      state.initPromise = null; // allow retry on next access
    });
  }
  return state;
}

/**
 * Resolves once the feed has loaded the catalog and seeded its buffer.
 * Used by the SSE route so the very first backlog is already populated.
 */
export function ensureFeedReady(): Promise<void> {
  const state = ensureStarted();
  return state.initPromise ?? Promise.resolve();
}

/** Last `n` events, newest first. Lazily starts the generator. */
export function getRecentEvents(n = 20): FeedEvent[] {
  const state = ensureStarted();
  if (n <= 0) return [];
  return state.buffer.slice(-n).reverse();
}

/**
 * Subscribe to new feed events. Returns an unsubscribe function.
 * Lazily starts the generator on first call.
 */
export function subscribe(cb: (e: FeedEvent) => void): () => void {
  const state = ensureStarted();
  state.subscribers.add(cb);
  return () => {
    state.subscribers.delete(cb);
  };
}
