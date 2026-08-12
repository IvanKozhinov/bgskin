// Client IP extraction and IP → country resolution.
// Behind Cloudflare the real client IP is in CF-Connecting-IP (forwarded by
// Caddy as X-Real-IP) and the country is in CF-IPCountry — no external call
// needed. When those are absent, fall back to a cached ip-api.com lookup.

import { getGeoCache, setGeoCache } from "./db";

export function clientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return null;
}

function countryName(code: string | null): string | null {
  if (!code || code === "XX" || code.length !== 2) return null;
  try {
    return new Intl.DisplayNames(["ru"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function isPublicIp(ip: string): boolean {
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip === "::1") return false;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip))
    return false;
  return true;
}

/**
 * Resolve {country, countryName} for a request. Prefers Cloudflare's
 * CF-IPCountry header; otherwise looks up (and caches) via ip-api.com.
 * Never throws.
 */
export async function resolveCountry(
  headers: Headers,
  ip: string | null,
): Promise<{ country: string | null; countryName: string | null }> {
  const cfCountry = headers.get("cf-ipcountry");
  if (cfCountry && cfCountry !== "XX" && cfCountry.length === 2) {
    return { country: cfCountry.toUpperCase(), countryName: countryName(cfCountry) };
  }
  if (!ip || !isPublicIp(ip)) return { country: null, countryName: null };

  const cached = getGeoCache(ip);
  if (cached) return cached;

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`,
      { signal: AbortSignal.timeout(4000), cache: "no-store" },
    );
    const data = (await res.json()) as { status?: string; countryCode?: string };
    const code = data.status === "success" && data.countryCode ? data.countryCode : null;
    const result = { country: code, countryName: countryName(code) };
    setGeoCache(ip, result.country, result.countryName);
    return result;
  } catch {
    return { country: null, countryName: null };
  }
}
