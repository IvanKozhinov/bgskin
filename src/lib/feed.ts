// Fictional live purchase feed (simulated social proof).
// A globalThis singleton generates fake purchase events from real catalog items
// every 2.5–9 s, keeps a ring buffer of the last 60 and fans events out to
// SSE subscribers. Started lazily on first access; survives HMR without
// duplicating timers (handle is stored on globalThis and cleared before re-arming).

import { getAllItems } from "@/lib/catalog";
import type { CatalogItem, FeedEvent } from "@/lib/types";

const MIN_DELAY_MS = 2_500;
const MAX_DELAY_MS = 9_000;
const BUFFER_SIZE = 60;
const SEED_COUNT = 25;
const SEED_SPAN_MS = 20 * 60 * 1000; // seed events are backdated over the last 20 min
const CHEAP_THRESHOLD_CENTS = 5_000; // "$50"
const CHEAP_PICK_PROBABILITY = 0.7; // 70% of picks come from the cheap pool
const FALLBACK_PRICE_CENTS = 500; // guard: prices may be 0 before the price merge

/** ~70 realistic Russian/English gaming nicknames (fictional). */
const NICKS: readonly string[] = [
  "S1mpleKiller",
  "xX_Predator_Xx",
  "KolyaOgon",
  "HeadshotMachine",
  "NoScopeNikita",
  "VandalHunter",
  "RushBcyka",
  "Tox1cWolf",
  "DimaFragger",
  "GhostRider777",
  "KrylovTop",
  "SnayperVanya",
  "MaxPayneRU",
  "BorisBlade",
  "ZloyPingvin",
  "FlickMaster",
  "AWPLordRU",
  "SmokeCriminal",
  "One_Tap_God",
  "PashaZigZag",
  "CyberSova",
  "NightStalkerX",
  "JukeKing",
  "MolotovMisha",
  "StaryiVolk",
  "EcoWarrior",
  "KennyFanBoy",
  "DeagleDima",
  "SilverSurferRU",
  "GromovS",
  "BaitMaster2000",
  "ClutchOrKick",
  "SanyaTurbo",
  "PixelHunter",
  "WallbangWizard",
  "RostovRambo",
  "FastFingers",
  "LuckyLeha",
  "QuietStorm",
  "BunnyHopper",
  "MirageMaster",
  "InfernoDemon",
  "TrainRusher",
  "DustDevilRU",
  "CacheKing",
  "OverpassOgre",
  "NukeNikola",
  "VertigoViking",
  "AncientAztec",
  "AnubisPharaoh",
  "SteamSammy",
  "TiltedTolik",
  "RagingBull",
  "IceColdIgor",
  "MoscowMauler",
  "PiterPunisher",
  "SibirSniper",
  "UralUltra",
  "KazanKrusher",
  "OmskOverlord",
  "NovosibNinja",
  "VolgaViper",
  "DonDestroyer",
  "BaltikaBrawler",
  "TundraTiger",
  "TaigaTerror",
  "PolarPavel",
  "CosmoCossack",
  "RedlineRider",
  "AsiimovAce",
  "Kolyan228",
];

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

/** Random item, weighted toward cheaper (70% under $50) and more popular items. */
function pickItem(items: CatalogItem[]): CatalogItem {
  const cheap = items.filter((i) => effectivePrice(i) < CHEAP_THRESHOLD_CENTS);
  const pool =
    cheap.length > 0 && Math.random() < CHEAP_PICK_PROBABILITY ? cheap : items;
  // Popularity bias: draw two candidates, keep the more popular one.
  const a = pool[Math.floor(Math.random() * pool.length)];
  const b = pool[Math.floor(Math.random() * pool.length)];
  return b.popularity > a.popularity ? b : a;
}

function makeEvent(item: CatalogItem, ts: number): FeedEvent {
  return {
    id: crypto.randomUUID(),
    kind: "purchase",
    buyer: maskNick(NICKS[Math.floor(Math.random() * NICKS.length)]),
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
  state.buffer.push(e);
  if (state.buffer.length > BUFFER_SIZE) {
    state.buffer.splice(0, state.buffer.length - BUFFER_SIZE);
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
  const offsets = Array.from(
    { length: SEED_COUNT },
    () => Math.random() * SEED_SPAN_MS,
  ).sort((a, b) => b - a); // descending offset → ascending timestamps (oldest first)
  for (const offset of offsets) {
    state.buffer.push(makeEvent(pickItem(state.items), now - offset));
  }
}

function scheduleNext(state: FeedState): void {
  // The handle lives on globalThis: clearing before re-creating guarantees a
  // single timer chain even across dev HMR module reloads.
  if (state.timer) clearTimeout(state.timer);
  const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  const handle = setTimeout(() => {
    if (state.items.length > 0) {
      pushEvent(state, makeEvent(pickItem(state.items), Date.now()));
    }
    scheduleNext(state);
  }, delay);
  if (typeof handle === "object" && handle !== null && "unref" in handle) {
    handle.unref(); // never keep the process alive just for the fake feed
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
