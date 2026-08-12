import { logEvent } from "@/lib/events";
import { clearSession, getSessionSteamId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  await logEvent(request, { steamId: await getSessionSteamId(), type: "logout" });
  await clearSession();
  return Response.json({ ok: true });
}
