// GET/POST /api/admin/pricing — markup configuration plus a live view of the
// Skinsback sync (how many offers are cached and when they were fetched).

import { isAdminAuthed } from "@/lib/admin";
import { isSkinsbackLive } from "@/lib/config";
import { DEFAULT_PRICING, getPricingConfig, setPricingConfig } from "@/lib/pricing";
import { getLiveOffers, pricesFetchedAt } from "@/lib/prices";
import type { PricingConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUMBER_KEYS = [
  "markupPercent",
  "minMarkupCents",
  "roundToCents",
  "maxSlippagePercent",
] as const;

function buildPatch(body: unknown): Partial<PricingConfig> {
  const patch: Partial<PricingConfig> = {};
  if (typeof body !== "object" || body === null) return patch;
  const b = body as Record<string, unknown>;

  for (const key of NUMBER_KEYS) {
    const v = b[key];
    if (typeof v === "number" && Number.isFinite(v)) patch[key] = v;
  }

  if (Array.isArray(b.tiers)) {
    const tiers: PricingConfig["tiers"] = [];
    for (const raw of b.tiers) {
      if (typeof raw !== "object" || raw === null) continue;
      const t = raw as Record<string, unknown>;
      const uptoCents = typeof t.uptoCents === "number" ? t.uptoCents : NaN;
      const percent = typeof t.percent === "number" ? t.percent : NaN;
      if (!Number.isFinite(uptoCents) || !Number.isFinite(percent)) continue;
      tiers.push({ uptoCents, percent });
    }
    patch.tiers = tiers; // lib clamps/sorts
  }

  return patch;
}

/** Skinsback sync snapshot for the admin panel. Never throws. */
async function syncStatus(): Promise<{
  live: boolean;
  offers: number;
  fetchedAt: number;
}> {
  if (!isSkinsbackLive()) return { live: false, offers: 0, fetchedAt: 0 };
  let offers = 0;
  try {
    offers = (await getLiveOffers())?.size ?? 0;
  } catch {
    offers = 0;
  }
  return { live: true, offers, fetchedAt: pricesFetchedAt() };
}

export async function GET(request: Request): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("defaults") === "1") {
    return Response.json(DEFAULT_PRICING);
  }
  return Response.json({ ...getPricingConfig(), sync: await syncStatus() });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Некорректный запрос" }, { status: 400 });
  }

  const saved = setPricingConfig(buildPatch(body));
  return Response.json({ ok: true, config: { ...saved, sync: await syncStatus() } });
}
