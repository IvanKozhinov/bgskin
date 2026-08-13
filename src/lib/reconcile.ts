// Order reconciler: the safety net behind the Skinsback webhook.
//
// A webhook can be lost (deploy, network, provider hiccup). Without a second
// path an order would sit in "processing"/"sent" forever with the buyer's money
// already debited. This polls market_getinfo for stale in-flight orders and
// either advances them or fails+refunds — and refunds outright when an order
// has been stuck past HARD_TIMEOUT_S with no answer from the provider.

import { isSkinsbackLive } from "./config";
import {
  advanceOrderStatus,
  failAndRefundOnce,
  listStaleOpenOrders,
  refundRolledBackOrder,
} from "./db";
import { sbOrderInfo, SkinsbackApiError } from "./skinsback";
import type { OrderStatus } from "./types";

const STALE_AFTER_S = 90; // don't poll an order that just changed
const HARD_TIMEOUT_S = 45 * 60; // give up and refund after this long (from creation)
// A purchase Skinsback has no record of is refundable much sooner: the provider
// answered definitively. Small grace so an in-flight registration isn't killed.
const NOT_FOUND_GRACE_S = 5 * 60;
const MAX_PER_RUN = 25;
const MIN_RUN_INTERVAL_MS = 60_000;

const FAILED_OFFER = new Set([
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
  if (FAILED_OFFER.has(offerStatus)) return "failed";
  return null;
}

const g = globalThis as typeof globalThis & { __bgaReconcile?: { at: number; run: Promise<ReconcileResult> | null } };

export interface ReconcileResult {
  checked: number;
  delivered: number;
  refunded: number;
  advanced: number;
  errors: number;
}

const EMPTY: ReconcileResult = { checked: 0, delivered: 0, refunded: 0, advanced: 0, errors: 0 };

async function run(): Promise<ReconcileResult> {
  const result: ReconcileResult = { ...EMPTY };
  if (!isSkinsbackLive()) return result;

  const stale = listStaleOpenOrders(STALE_AFTER_S, MAX_PER_RUN);
  for (const order of stale) {
    result.checked++;
    try {
      const info = await sbOrderInfo(order.customId);
      const next = mapOfferStatus(info.offerStatus);
      if (info.offerStatus === "rollback_user" || info.offerStatus === "rollback_supplier") {
        if (refundRolledBackOrder(order.customId)) result.refunded++;
      } else if (next === "failed") {
        if (failAndRefundOnce(order.customId)) result.refunded++;
      } else if (next === "delivered") {
        advanceOrderStatus(order.customId, "delivered");
        result.delivered++;
      } else if (next) {
        advanceOrderStatus(order.customId, next);
        result.advanced++;
      } else if (order.ageSeconds > HARD_TIMEOUT_S) {
        // Unknown status for far too long — return the money.
        if (failAndRefundOnce(order.customId)) result.refunded++;
      }
    } catch (err) {
      // "purchase_not_found" is a definitive answer: the buy never registered,
      // so the debit has no counterpart and must go back. Other API errors get
      // the full hard timeout; network/timeout errors just wait for the next run.
      const notFound =
        err instanceof SkinsbackApiError && err.code === "purchase_not_found";
      const refundable = notFound
        ? order.ageSeconds > NOT_FOUND_GRACE_S
        : err instanceof SkinsbackApiError && order.ageSeconds > HARD_TIMEOUT_S;
      if (refundable) {
        if (failAndRefundOnce(order.customId)) result.refunded++;
      } else {
        result.errors++;
      }
    }
  }
  return result;
}

/**
 * Run the reconciler, at most once per MIN_RUN_INTERVAL_MS across the process.
 * Safe to call from request handlers; concurrent callers share one run.
 */
export async function reconcileOrders(force = false): Promise<ReconcileResult> {
  if (!g.__bgaReconcile) g.__bgaReconcile = { at: 0, run: null };
  const s = g.__bgaReconcile;
  if (s.run) return s.run;
  if (!force && Date.now() - s.at < MIN_RUN_INTERVAL_MS) return { ...EMPTY };
  s.at = Date.now();
  s.run = run().finally(() => {
    s.run = null;
  });
  return s.run;
}

/** Fire-and-forget variant for request paths that must not wait. */
export function reconcileOrdersInBackground(): void {
  void reconcileOrders().catch((err) => {
    console.warn("[reconcile] failed:", err);
  });
}
