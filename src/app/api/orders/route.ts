// GET /api/orders — current user's order history.
// Opening this page is also the cheapest natural trigger for the reconciler,
// so a lost webhook still gets caught (throttled to one run per minute).

import { listOrders } from "@/lib/db";
import { reconcileOrders } from "@/lib/reconcile";
import { getSessionSteamId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  // Await it: the user is looking at exactly these orders, so a fresh status is
  // worth the wait. It is throttled and bounded, and never throws.
  try {
    await reconcileOrders();
  } catch {
    // reconciliation is best-effort — never block the history
  }

  return Response.json({ orders: listOrders(steamId) });
}
