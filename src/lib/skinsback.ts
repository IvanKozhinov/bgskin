// Skinsback market API client.
// Every method is a POST to a single endpoint with `method` in the body,
// signed with the legacy shopid/sign scheme (HMAC-SHA1 over sorted params).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { skinsbackSecret, skinsbackShopId } from "./config";

const API_URL = "https://skinsback.com/api.php";
const REQUEST_TIMEOUT_MS = 15_000;

type SbScalar = string | number;
type SbParamValue = SbScalar | SbScalar[];
type SbParams = Record<string, SbParamValue>;

/**
 * Legacy Skinsback signature: sort param keys alphabetically, skip the key
 * "sign" and any array/object values, concatenate `key:value;` pairs and
 * take a hex HMAC-SHA1 of the result with the shop secret as key.
 */
function buildSign(params: SbParams, secret: string): string {
  const base = Object.keys(params)
    .filter((k) => k !== "sign" && typeof params[k] !== "object")
    .sort()
    .map((k) => `${k}:${String(params[k])};`)
    .join("");
  return createHmac("sha1", secret).update(base).digest("hex");
}

/** application/x-www-form-urlencoded body; arrays become `key[]=v1&key[]=v2`. */
function encodeBody(params: SbParams): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) sp.append(`${key}[]`, String(v));
    } else {
      sp.append(key, String(value));
    }
  }
  return sp.toString();
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

async function sbCall(method: string, params: SbParams = {}): Promise<Record<string, unknown>> {
  const shopId = skinsbackShopId();
  const secret = skinsbackSecret();
  if (!shopId || !secret) {
    throw new Error("Skinsback is not configured (SKINSBACK_SHOP_ID / SKINSBACK_SECRET missing)");
  }
  const full: SbParams = { ...params, method, shopid: shopId };
  full.sign = buildSign(full, secret);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeBody(full),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Skinsback HTTP ${res.status} for method ${method}`);
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Skinsback returned non-JSON response for method ${method}`);
  }
  const json = asRecord(parsed);
  if (!json) {
    throw new Error(`Skinsback returned unexpected payload for method ${method}`);
  }
  if (json.status !== "success") {
    const message =
      typeof json.error_message === "string" && json.error_message
        ? json.error_message
        : `Skinsback error ${toStr(json.error_code) || "unknown"} (method ${method})`;
    throw new Error(message);
  }
  return json;
}

/** Full CS2 price list (grouped form). Prices are float USD. */
export async function sbPricelist(): Promise<{
  last_update: string;
  items: { name: string; price: number; count: number }[];
}> {
  const json = await sbCall("market_pricelist", { game: "cs2" });
  const rawItems = Array.isArray(json.items) ? json.items : [];
  const items: { name: string; price: number; count: number }[] = [];
  for (const raw of rawItems) {
    const r = asRecord(raw);
    if (!r) continue;
    const name = toStr(r.name);
    if (!name) continue;
    items.push({ name, price: toNumber(r.price), count: toNumber(r.count) });
  }
  return { last_update: toStr(json.last_update), items };
}

/** Search purchasable offers by market name. */
export async function sbSearch(
  name: string,
): Promise<{ id: string; name: string; price: number; delivery_type: number }[]> {
  const json = await sbCall("market_search", { game: "cs2", name, limit: 50 });
  const rawItems = Array.isArray(json.items) ? json.items : [];
  const items: { id: string; name: string; price: number; delivery_type: number }[] = [];
  for (const raw of rawItems) {
    const r = asRecord(raw);
    if (!r) continue;
    const id = toStr(r.id);
    const itemName = toStr(r.name);
    if (!id || !itemName) continue;
    items.push({
      id,
      name: itemName,
      price: toNumber(r.price),
      delivery_type: toNumber(r.delivery_type),
    });
  }
  return items;
}

/** Buy a specific offer by id. Throws Error(error_message) on API error. */
export async function sbBuyById(opts: {
  id: string;
  maxPriceUsd: number;
  partner: string;
  token: string;
  customId: string;
}): Promise<{ buyId: string; offerStatus: string; debitedUsd: number }> {
  const json = await sbCall("market_buy", {
    id: opts.id,
    max_price: opts.maxPriceUsd.toFixed(2),
    partner: opts.partner,
    token: opts.token,
    custom_id: opts.customId,
  });
  const item = asRecord(json.item);
  return {
    buyId: toStr(json.buy_id ?? json.id ?? item?.buy_id),
    offerStatus: toStr(json.offer_status ?? item?.offer_status) || "pending",
    debitedUsd: toNumber(json.balance_debited_sum ?? json.debited_sum ?? item?.price),
  };
}

/** Fetch current status of a purchase by our custom id. */
export async function sbOrderInfo(customId: string): Promise<{ offerStatus: string; buyId: string }> {
  const json = await sbCall("market_getinfo", { custom_ids: [customId] });
  const rawItems = Array.isArray(json.items) ? json.items : [];
  const first = asRecord(rawItems[0]);
  if (!first) {
    throw new Error(`Skinsback: no order info for custom_id ${customId}`);
  }
  return {
    offerStatus: toStr(first.offer_status ?? first.status),
    buyId: toStr(first.buy_id ?? first.id),
  };
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify a Skinsback webhook.
 * Accepts either:
 *  - header "Signature" = hex HMAC-SHA256(rawBody, secret), or
 *  - header "X-SIGN" = md5(shopId + secret).
 * Returns false when no secret is configured.
 */
export function verifyWebhookSignature(rawBody: string, headers: Headers): boolean {
  const secret = skinsbackSecret();
  if (!secret) return false;

  const signature = headers.get("Signature") ?? headers.get("signature");
  if (signature) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (safeEqualHex(signature.trim().toLowerCase(), expected)) return true;
  }

  const xSign = headers.get("X-SIGN") ?? headers.get("x-sign");
  const shopId = skinsbackShopId();
  if (xSign && shopId) {
    const expected = createHash("md5").update(shopId + secret).digest("hex");
    if (safeEqualHex(xSign.trim().toLowerCase(), expected)) return true;
  }

  return false;
}

/** Parse a Steam trade offer URL into its partner/token parts. */
export function parseTradeUrl(url: string): { partner: string; token: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "steamcommunity.com" && host !== "www.steamcommunity.com") return null;
  if (!parsed.pathname.replace(/\/+$/, "").endsWith("/tradeoffer/new")) return null;
  const partner = parsed.searchParams.get("partner");
  const token = parsed.searchParams.get("token");
  if (!partner || !token) return null;
  if (!/^\d{1,12}$/.test(partner)) return null;
  if (!/^[A-Za-z0-9_-]{4,32}$/.test(token)) return null;
  return { partner, token };
}
