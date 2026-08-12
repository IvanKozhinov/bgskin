// GET /api/deposits — current user's deposit/top-up history.

import { listDepositsByUser } from "@/lib/db";
import { getSessionSteamId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }
  return Response.json({ deposits: listDepositsByUser(steamId) });
}
