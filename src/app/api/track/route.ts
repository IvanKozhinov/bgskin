// POST /api/track — best-effort pageview logging with IP + country.
// Never errors on a bad body; always returns 204.

import { logEvent } from "@/lib/events";
import { getSessionSteamId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let path: string | null = null;
  try {
    const body = (await request.json()) as { path?: unknown } | null;
    if (body && typeof body.path === "string") {
      path = body.path.slice(0, 200);
    }
  } catch {
    // ignore malformed body
  }

  try {
    const steamId = await getSessionSteamId();
    await logEvent(request, { steamId, type: "pageview", path });
  } catch {
    // logging is best-effort — never surface an error
  }

  return new Response(null, { status: 204 });
}
