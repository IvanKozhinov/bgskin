// GET /api/orders — current user's order history.

import { listOrders } from "@/lib/db";
import { getSessionSteamId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }
  return Response.json({ orders: listOrders(steamId) });
}
