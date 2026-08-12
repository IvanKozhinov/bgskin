/**
 * BGASkins catalog fetcher.
 *
 * Downloads the ByMykel/CSGO-API grouped skins list, slims it down to the
 * CatalogItem shape from src/lib/types.ts and writes:
 *   - data/catalog.json       (full catalog)
 *   - data/catalog.seed.json  (~250 popular items, committed fallback)
 *
 * Run: npx tsx scripts/fetch-catalog.ts
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogItem, ItemCategory, RarityId } from "../src/lib/types";

const SOURCE_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json";

const SEED_TARGET = 250;

/** Weapons whose every skin goes into the seed subset. */
const SEED_WEAPONS = new Set<string>([
  "AK-47",
  "M4A4",
  "M4A1-S",
  "AWP",
  "Desert Eagle",
  "USP-S",
  "Glock-18",
  "Butterfly Knife",
  "Karambit",
  "M9 Bayonet",
]);

/** Raw object shape in ByMykel/CSGO-API skins.json (fields we consume). */
interface RawSkin {
  id?: string;
  name?: string;
  weapon?: { name?: string } | null;
  category?: { name?: string } | null;
  rarity?: { name?: string; color?: string } | null;
  min_float?: number | null;
  max_float?: number | null;
  stattrak?: boolean;
  souvenir?: boolean;
  image?: string | null;
  collections?: { name?: string }[] | null;
}

const CATEGORY_MAP: Record<string, ItemCategory> = {
  Pistols: "pistol",
  Rifles: "rifle",
  SMGs: "smg",
  Heavy: "heavy",
  Knives: "knife",
  Gloves: "gloves",
};

const RARITY_MAP: Record<string, RarityId> = {
  "Consumer Grade": "consumer",
  "Industrial Grade": "industrial",
  "Mil-Spec Grade": "milspec",
  Restricted: "restricted",
  Classified: "classified",
  Covert: "covert",
  Contraband: "contraband",
  Extraordinary: "extraordinary",
};

/** 32-bit FNV-1a hash. Must stay in sync with src/lib/catalog.ts. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** "★ Butterfly Knife | Fade" -> "butterfly-knife-fade" */
function slugify(name: string): string {
  return name
    .replace(/★/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function transform(raw: RawSkin[]): CatalogItem[] {
  const items: CatalogItem[] = [];
  const seen = new Map<string, number>();
  let skippedNoImage = 0;
  let skippedBad = 0;

  for (const s of raw) {
    const name = typeof s.name === "string" ? s.name.trim() : "";
    const image = typeof s.image === "string" ? s.image.trim() : "";
    if (!name) {
      skippedBad++;
      continue;
    }
    if (!image) {
      skippedNoImage++;
      continue;
    }

    const baseSlug = slugify(name);
    if (!baseSlug) {
      skippedBad++;
      continue;
    }
    const nth = (seen.get(baseSlug) ?? 0) + 1;
    seen.set(baseSlug, nth);
    const id = nth === 1 ? baseSlug : `${baseSlug}-${nth}`;

    const weapon =
      (s.weapon?.name ?? "").trim() ||
      name.replace(/^★\s*/, "").split(" | ")[0].trim();

    const categoryName = s.category?.name ?? "";
    const category: ItemCategory = CATEGORY_MAP[categoryName] ?? "other";

    const rarityName = s.rarity?.name ?? "";
    const rarity: RarityId = RARITY_MAP[rarityName] ?? "consumer";

    const collection = s.collections?.[0]?.name?.trim();

    items.push({
      id,
      name,
      weapon,
      category,
      rarity,
      image,
      minFloat: typeof s.min_float === "number" ? s.min_float : 0,
      maxFloat: typeof s.max_float === "number" ? s.max_float : 1,
      stattrak: s.stattrak === true,
      souvenir: s.souvenir === true,
      ...(collection ? { collection } : {}),
      priceCents: 0, // filled at runtime by src/lib/catalog.ts
      popularity: fnv1a(id) % 101,
    });
  }

  console.log(
    `Transformed ${items.length} items (skipped ${skippedNoImage} without image, ${skippedBad} malformed).`
  );
  return items;
}

function buildSeed(items: CatalogItem[]): CatalogItem[] {
  // Round-robin across the popular weapons so each is represented, capped at
  // SEED_TARGET; if the popular set is smaller than the target, top up with
  // the first non-popular items in catalog order.
  const buckets = new Map<string, CatalogItem[]>();
  for (const w of SEED_WEAPONS) buckets.set(w, []);
  for (const it of items) buckets.get(it.weapon)?.push(it);

  const seed: CatalogItem[] = [];
  for (let round = 0; seed.length < SEED_TARGET; round++) {
    let took = false;
    for (const bucket of buckets.values()) {
      if (round < bucket.length && seed.length < SEED_TARGET) {
        seed.push(bucket[round]);
        took = true;
      }
    }
    if (!took) break; // every bucket exhausted
  }
  if (seed.length < SEED_TARGET) {
    for (const it of items) {
      if (seed.length >= SEED_TARGET) break;
      if (!SEED_WEAPONS.has(it.weapon)) seed.push(it);
    }
  }
  return seed;
}

async function main(): Promise<void> {
  console.log(`Downloading ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const body = await res.text();
  console.log(`Downloaded ${(body.length / 1024 / 1024).toFixed(1)} MB.`);

  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected payload: expected a top-level JSON array.");
  }
  const items = transform(parsed as RawSkin[]);
  if (items.length < 500) {
    throw new Error(
      `Sanity check failed: only ${items.length} items after transform.`
    );
  }
  const seed = buildSeed(items);

  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });

  const catalogPath = path.join(dataDir, "catalog.json");
  const seedPath = path.join(dataDir, "catalog.seed.json");
  writeFileSync(catalogPath, JSON.stringify(items));
  writeFileSync(seedPath, JSON.stringify(seed));

  // Verify round-trip.
  const checkFull = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogItem[];
  const checkSeed = JSON.parse(readFileSync(seedPath, "utf8")) as CatalogItem[];
  console.log(`Wrote ${catalogPath} (${checkFull.length} items).`);
  console.log(`Wrote ${seedPath} (${checkSeed.length} items).`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
