// Shared contracts for BGSkins. Single source of truth — import, never redefine.

export type ItemCategory =
  | "pistol"
  | "rifle"
  | "smg"
  | "heavy"
  | "knife"
  | "gloves"
  | "other";

export type RarityId =
  | "consumer"
  | "industrial"
  | "milspec"
  | "restricted"
  | "classified"
  | "covert"
  | "contraband"
  | "extraordinary"; // gloves/knives ("Extraordinary" / gold tier)

export const RARITY_META: Record<RarityId, { label: string; color: string }> = {
  consumer: { label: "Consumer", color: "#b0c3d9" },
  industrial: { label: "Industrial", color: "#5e98d9" },
  milspec: { label: "Mil-Spec", color: "#4b69ff" },
  restricted: { label: "Restricted", color: "#8847ff" },
  classified: { label: "Classified", color: "#d32ce6" },
  covert: { label: "Covert", color: "#eb4b4b" },
  contraband: { label: "Contraband", color: "#e4ae39" },
  extraordinary: { label: "Extraordinary", color: "#ffd700" },
};

export interface CatalogItem {
  id: string; // stable slug, e.g. "ak-47-redline"
  name: string; // full market name without wear, e.g. "AK-47 | Redline"
  weapon: string; // "AK-47"
  category: ItemCategory;
  rarity: RarityId;
  image: string; // absolute image URL (Steam CDN)
  minFloat: number;
  maxFloat: number;
  stattrak: boolean; // stattrak variant exists
  souvenir: boolean;
  /**
   * "extra" = non-skin inventory (case, sticker, agent, graffiti …). These are
   * only listed when Skinsback actually quotes a price for them: a fabricated
   * demo price for a sticker is meaningless.
   */
  kind?: "skin" | "extra";
  collection?: string;
  priceCents: number; // price shown to the buyer (Skinsback cost + markup), cents USD
  costCents?: number; // what Skinsback charges us, cents USD — never shown to buyers
  /**
   * Exact Skinsback market name of the cheapest variant behind this card
   * (e.g. "AK-47 | Redline (Field-Tested)"). market_search matches only the
   * full name, so the buy path must use this rather than the base name.
   */
  sourceName?: string;
  stock?: number; // units Skinsback currently has for this name
  popularity: number; // 0..100 synthetic, for "hot" sorting
  available?: boolean; // false in live mode when no Skinsback price exists (not buyable). undefined == true.
}

export interface CatalogFilters {
  q?: string;
  category?: ItemCategory;
  weapon?: string;
  rarity?: RarityId[];
  minPriceCents?: number;
  maxPriceCents?: number;
  stattrak?: boolean;
  sort?: "popular" | "price_asc" | "price_desc" | "name";
  page?: number; // 1-based
  perPage?: number; // default 24, max 60
}

export interface CatalogFacets {
  weapons: { weapon: string; count: number }[];
  rarities: { rarity: RarityId; count: number }[];
  priceBoundsCents: { min: number; max: number };
}

export interface CatalogResponse {
  items: CatalogItem[];
  total: number;
  page: number;
  perPage: number;
  facets: CatalogFacets;
}

export interface SessionUser {
  steamId: string;
  name: string;
  avatar: string; // URL
  tradeUrl: string | null;
  balanceCents: number;
}

export type OrderStatus =
  | "pending"
  | "processing"
  | "sent"
  | "delivered"
  | "failed"
  | "demo_delivered";

export interface Order {
  id: number;
  itemId: string;
  itemName: string;
  priceCents: number;
  status: OrderStatus;
  createdAt: string; // ISO
}

export interface FeedEvent {
  id: string;
  kind: "purchase";
  buyer: string; // display nickname (fictional)
  itemId: string;
  itemName: string;
  weapon: string;
  rarity: RarityId;
  image: string;
  priceCents: number;
  ts: number; // epoch ms
}

export interface MeResponse {
  user: SessionUser | null;
}

// ---- Payments / deposits -----------------------------------------------------

export type PaymentMethodId = "sbp" | "card" | "stripe" | "heleket";

export interface PaymentMethodInfo {
  id: PaymentMethodId;
  label: string;
  description: string;
  /** Provider keys present → real hosted checkout available. */
  configured: boolean;
}

export type DepositStatus =
  | "created" // record created, awaiting provider redirect
  | "pending" // provider not configured yet, or awaiting payment
  | "paid" // provider confirmed payment; balance credited
  | "failed"
  | "canceled";

export interface Deposit {
  id: number;
  amountCents: number;
  method: PaymentMethodId;
  status: DepositStatus;
  createdAt: string;
}

export interface DepositResponse {
  ok: boolean;
  error?: string;
  deposit?: Deposit;
  /** When the provider is configured, the hosted-checkout URL to redirect to. */
  checkoutUrl?: string;
  /** True when the method has no keys yet — UI shows an "onboarding" state. */
  awaitingProvider?: boolean;
}

// ---- Admin -------------------------------------------------------------------

export interface UserEvent {
  id: number;
  steamId: string | null;
  type: string; // "login" | "logout" | "buy" | "deposit" | "tradeurl" | "pageview" | ...
  ip: string | null;
  country: string | null; // ISO-3166 alpha-2, e.g. "RU"
  countryName: string | null;
  path: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminUserRow {
  steamId: string;
  name: string;
  avatar: string;
  balanceCents: number;
  tradeUrl: string | null;
  createdAt: string;
  lastIp: string | null;
  lastCountry: string | null;
  eventCount: number;
  orderCount: number;
}

export interface Policy {
  slug: string; // "terms" | "privacy" | "refund" | "aml" | custom
  title: string;
  bodyMd: string; // Markdown source
  published: boolean;
  showInFaq: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface FeedConfig {
  enabled: boolean;
  minIntervalMs: number;
  maxIntervalMs: number;
  backlogSize: number; // pre-seeded events shown on load
  ringSize: number; // events retained in memory
  maskNicks: boolean;
  cheapBias: number; // 0..1 — share of picks biased to cheaper items
  cheapThresholdCents: number; // "cheap" cutoff for the bias
  minPriceCents: number; // only surface items at/above this price
  maxPriceCents: number; // 0 = no cap
  nicks: string[]; // buyer nickname pool
}

/**
 * How the shop price is derived from the Skinsback cost.
 * Buyer price = cost * (1 + percent/100), raised to at least `minMarkupCents`
 * above cost, then rounded. `tiers` override `percent` for costs at or below
 * their `uptoCents` threshold (first match wins, ascending) — cheap skins
 * usually need a bigger margin than expensive ones.
 */
export interface PricingConfig {
  markupPercent: number; // default margin over Skinsback cost
  tiers: { uptoCents: number; percent: number }[];
  minMarkupCents: number; // floor on absolute margin per item
  roundToCents: number; // 1 = exact cents, 10 = round up to $0.10, 100 = to $1
  maxSlippagePercent: number; // how far above cost we still accept at buy time
}

export interface BuyResponse {
  ok: boolean;
  error?: string;
  order?: Order;
  newBalanceCents?: number;
  /** Set when the store price moved since the item was shown; client re-confirms. */
  priceChanged?: boolean;
  currentPriceCents?: number;
  /** Purchase is in flight and not yet confirmed; balance NOT refunded. */
  pending?: boolean;
  /** User has no trade link — the client must prompt for it before buying. */
  needsTradeUrl?: boolean;
  /** Balance too low — the client should route the user to top-up. */
  needsDeposit?: boolean;
  /** Item delivery isn't available yet (Skinsback not connected). */
  fulfillmentUnavailable?: boolean;
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function rarityColor(r: RarityId): string {
  return RARITY_META[r]?.color ?? "#b0c3d9";
}
