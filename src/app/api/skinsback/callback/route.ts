// POST /api/skinsback/callback — Skinsback webhook.
// Verifies the signature over the raw body, maps offer_status to our
// OrderStatus and refunds the user (once) when a purchase fails.

import { credit, getOrderRowByCustomId, updateOrderStatus } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/skinsback";
import type { OrderStatus } from "@/lib/types";

export const runtime = "nodejs";

const FAILED_OFFER_STATUSES = new Set([
  "canceled",
  "timeout",
  "invalid_trade_token",
  "user_not_tradable",
  "trade_create_error",
  "rollback_user",
  "rollback_supplier",
]);

function mapOfferStatus(offerStatus: string): OrderStatus | null {
  if (offerStatus === "creating_trade") return "processing";
  if (offerStatus === "waiting_accept") return "sent";
  if (offerStatus === "accepted") return "delivered";
  if (FAILED_OFFER_STATUSES.has(offerStatus)) return "failed";
  return null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers)) {
    return Response.json({ ok: false, error: "invalid signature" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const root = asRecord(payload);
  const event = asStr(root?.event);
  const data = asRecord(root?.data);

  if ((event === "status_change" || event === "buy_item") && data) {
    const customId = asStr(data.custom_id);
    const offerStatus = asStr(data.offer_status);
    if (customId && offerStatus) {
      const row = getOrderRowByCustomId(customId);
      if (row) {
        const nextStatus = mapOfferStatus(offerStatus);
        if (nextStatus) {
          // Refund exactly once: skip if the order is already failed.
          if (nextStatus === "failed" && row.order.status !== "failed") {
            credit(row.userSteamId, row.order.priceCents);
          }
          updateOrderStatus({ customId, status: nextStatus });
        }
      }
    }
  }

  // Handled or unknown events both ack with 200 so Skinsback stops retrying.
  return Response.json({ ok: true });
}
