// GET /api/catalog — catalog query endpoint.
// Query params: q, category, weapon, rarity (comma-separated), minPrice /
// maxPrice (integer cents), stattrak=1, sort, page, perPage.

import { queryCatalog } from "@/lib/catalog";
import { RARITY_META } from "@/lib/types";
import type {
  CatalogFilters,
  ItemCategory,
  RarityId,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES: readonly ItemCategory[] = [
  "pistol",
  "rifle",
  "smg",
  "heavy",
  "knife",
  "gloves",
  "other",
];

const SORTS: readonly NonNullable<CatalogFilters["sort"]>[] = [
  "popular",
  "price_asc",
  "price_desc",
  "name",
];

function isCategory(v: string): v is ItemCategory {
  return (CATEGORIES as readonly string[]).includes(v);
}

function isRarity(v: string): v is RarityId {
  return v in RARITY_META;
}

function isSort(v: string): v is NonNullable<CatalogFilters["sort"]> {
  return (SORTS as readonly string[]).includes(v);
}

function parseCents(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parsePositiveInt(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const filters: CatalogFilters = {};

  const q = params.get("q")?.trim();
  if (q) filters.q = q;

  const category = params.get("category")?.trim() ?? "";
  if (isCategory(category)) filters.category = category;

  const weapon = params.get("weapon")?.trim();
  if (weapon) filters.weapon = weapon;

  const rarities = (params.get("rarity") ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(isRarity);
  if (rarities.length > 0) filters.rarity = rarities;

  const minPrice = parseCents(params.get("minPrice"));
  if (minPrice !== undefined) filters.minPriceCents = minPrice;
  const maxPrice = parseCents(params.get("maxPrice"));
  if (maxPrice !== undefined) filters.maxPriceCents = maxPrice;

  if (params.get("stattrak") === "1") filters.stattrak = true;

  const sort = params.get("sort")?.trim() ?? "";
  if (isSort(sort)) filters.sort = sort;

  const page = parsePositiveInt(params.get("page"));
  if (page !== undefined) filters.page = page;
  const perPage = parsePositiveInt(params.get("perPage"));
  if (perPage !== undefined) filters.perPage = perPage;

  return Response.json(await queryCatalog(filters));
}
