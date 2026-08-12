// Shared contracts for BGASkins. Single source of truth — import, never redefine.

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
  collection?: string;
  priceCents: number; // current price, integer cents USD
  popularity: number; // 0..100 synthetic, for "hot" sorting
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
  demo: boolean; // true when Skinsback keys are absent
}

export interface BuyResponse {
  ok: boolean;
  error?: string;
  order?: Order;
  newBalanceCents?: number;
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function rarityColor(r: RarityId): string {
  return RARITY_META[r]?.color ?? "#b0c3d9";
}
