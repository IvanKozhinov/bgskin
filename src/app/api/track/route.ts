// POST /api/track — best-effort pageview logging with IP + country.
// Only authenticated users are logged, and each is throttled, so an anonymous
// visitor can't flood the audit log. Never errors; always returns 204.

import { logEvent } from "@/lib/events";
import { getSessionSteamId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 2000; // at most one pageview per user per 2s
const g = globalThis as typeof globalThis & { __bgaTrackSeen?: Map<string, number> };
function seen(): Map<string, number> {
  if (!g.__bgaTrackSeen) g.__bgaTrackSeen = new Map();
  return g.__bgaTrackSeen;
}

export async function POST(request: Request): Promise<Response> {
  const noContent = new Response(null, { status: 204 });

  let steamId: string | null = null;
  try {
    steamId = await getSessionSteamId();
  } catch {
    steamId = null;
  }
  // Do not record anonymous pageviews — removes the unauthenticated-flood vector.
  if (!steamId) return noContent;

  const now = Date.now();
  const m = seen();
  const last = m.get(steamId) ?? 0;
  if (now - last < MIN_INTERVAL_MS) return noContent;
  m.set(steamId, now);
  if (m.size > 5000) {
    // bound the throttle map
    for (const [k, ts] of m) if (now - ts > 60_000) m.delete(k);
  }

  let path: string | null = null;
  try {
    const body = (await request.json()) as { path?: unknown } | null;
    if (body && typeof body.path === "string") path = body.path.slice(0, 200);
  } catch {
    // ignore malformed body
  }

  try {
    await logEvent(request, { steamId, type: "pageview", path });
  } catch {
    // logging is best-effort
  }

  return noContent;
}
