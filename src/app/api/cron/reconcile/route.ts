// POST /api/cron/reconcile — periodic order reconciliation, called by a timer.
//
// Without this the reconciler only runs when a buyer happens to open their
// order list: someone who closes the tab right after paying would have their
// order sit untouched until another visitor triggers it.
//
// Auth: a shared secret in the Authorization header (CRON_SECRET), compared in
// constant time. Absent secret = endpoint disabled, so it can never be an open
// trigger by accident.

import { timingSafeEqual } from "node:crypto";
import { reconcileOrders } from "@/lib/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const result = await reconcileOrders(true);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/reconcile] failed:", err);
    return Response.json({ ok: false, error: "reconcile failed" }, { status: 500 });
  }
}
