// Payment/deposit orchestration. Methods activate when their provider keys are
// present; otherwise a deposit is recorded as "pending" and the UI shows an
// onboarding state. No fake crediting — balance moves only on a verified
// provider callback (markDepositPaidOnce).

import { createHmac, timingSafeEqual } from "node:crypto";
import { siteUrl } from "./config";
import {
  isHeleketConfigured,
  isSbpConfigured,
  isStripeConfigured,
  stripeSecretKey,
  stripeWebhookSecret,
} from "./settings";
import { createDeposit, getDepositRow, setDepositProviderRef } from "./db";
import type { DepositResponse, PaymentMethodId, PaymentMethodInfo } from "./types";

export const MIN_DEPOSIT_CENTS = 100; // $1
export const MAX_DEPOSIT_CENTS = 500_000; // $5000

export function listPaymentMethods(): PaymentMethodInfo[] {
  return [
    {
      id: "sbp",
      label: "СБП",
      description: "Система быстрых платежей — оплата по QR или из банковского приложения.",
      configured: isSbpConfigured(),
    },
    {
      id: "card",
      label: "Банковская карта",
      description: "Visa / Mastercard / МИР через защищённую страницу эквайера.",
      configured: isSbpConfigured() || isStripeConfigured(),
    },
    {
      id: "stripe",
      label: "Stripe",
      description: "Международные карты через Stripe Checkout.",
      configured: isStripeConfigured(),
    },
    {
      id: "heleket",
      label: "Криптовалюта (Heleket)",
      description: "BTC, USDT, ETH и другие — оплата криптовалютой.",
      configured: isHeleketConfigured(),
    },
  ];
}

function isConfigured(method: PaymentMethodId): boolean {
  switch (method) {
    case "stripe":
      return isStripeConfigured();
    case "card":
      return isStripeConfigured() || isSbpConfigured();
    case "sbp":
      return isSbpConfigured();
    case "heleket":
      return isHeleketConfigured();
    default:
      return false;
  }
}

/** Create a Stripe Checkout Session and return its hosted URL, or null. */
async function stripeCheckout(depositId: number, amountCents: number): Promise<string | null> {
  const key = stripeSecretKey();
  if (!key) return null;
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("payment_method_types[0]", "card"); // card-only: no delayed-settlement methods
  body.set("success_url", `${siteUrl()}/wallet?deposit=${depositId}&status=success`);
  body.set("cancel_url", `${siteUrl()}/wallet?deposit=${depositId}&status=cancel`);
  body.set("client_reference_id", String(depositId));
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", String(amountCents));
  body.set("line_items[0][price_data][product_data][name]", "Пополнение баланса BGSkins");
  body.set("metadata[deposit_id]", String(depositId));
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; url?: string };
    if (data.id) setDepositProviderRef(depositId, data.id, "pending");
    return data.url ?? null;
  } catch {
    return null;
  }
}

export async function createDepositIntent(opts: {
  steamId: string;
  amountCents: number;
  method: PaymentMethodId;
}): Promise<DepositResponse> {
  const amount = Math.round(opts.amountCents);
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_CENTS || amount > MAX_DEPOSIT_CENTS) {
    return { ok: false, error: `Сумма должна быть от $${MIN_DEPOSIT_CENTS / 100} до $${MAX_DEPOSIT_CENTS / 100}` };
  }
  const configured = isConfigured(opts.method);
  const id = createDeposit({
    userSteamId: opts.steamId,
    amountCents: amount,
    method: opts.method,
    status: configured ? "created" : "pending",
  });
  const depositRow = getDepositRow(id)!;
  const deposit = {
    id: depositRow.id,
    amountCents: depositRow.amount_cents,
    method: depositRow.method,
    status: depositRow.status,
    createdAt: depositRow.created_at,
  };

  if (!configured) {
    // Provider not connected yet — honest pending state, no fake money.
    return { ok: true, deposit, awaitingProvider: true };
  }

  // Card falls back to Stripe when that's the configured card acquirer.
  if ((opts.method === "stripe" || opts.method === "card") && isStripeConfigured()) {
    const url = await stripeCheckout(id, amount);
    if (url) return { ok: true, deposit, checkoutUrl: url };
    return { ok: true, deposit, awaitingProvider: true, error: "Не удалось создать оплату, попробуйте позже" };
  }

  // Other configured providers would build their checkout here (СБП / Heleket).
  // Until wired, record the intent and surface the pending state.
  return { ok: true, deposit, awaitingProvider: true };
}

const WEBHOOK_TOLERANCE_S = 5 * 60; // reject signatures older than 5 minutes (replay window)

/**
 * Verify a Stripe webhook signature and return the deposit id to credit, or
 * null. Requires the Stripe webhook secret. Credits ONLY when the session is
 * actually paid — a `checkout.session.completed` with payment_status other than
 * "paid"/"no_payment_required" (e.g. async methods) is ignored; late settlement
 * arrives as `checkout.session.async_payment_succeeded`.
 */
export function verifyStripeWebhook(rawBody: string, sigHeader: string | null): number | null {
  const secret = stripeWebhookSecret();
  if (!secret || !sigHeader) return null;

  // Parse "t=..,v1=..,v1=.." — there may be multiple v1 signatures during key rotation.
  let t = "";
  const v1s: string[] = [];
  for (const part of sigHeader.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || v1s.length === 0) return null;

  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > WEBHOOK_TOLERANCE_S) return null;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const eb = Buffer.from(expected);
  const matched = v1s.some((v1) => {
    const b = Buffer.from(v1);
    return eb.length === b.length && timingSafeEqual(eb, b);
  });
  if (!matched) return null;

  try {
    const evt = JSON.parse(rawBody) as {
      type?: string;
      data?: {
        object?: {
          client_reference_id?: string;
          payment_status?: string;
          metadata?: { deposit_id?: string };
        };
      };
    };
    const paidEvents = new Set([
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ]);
    if (!evt.type || !paidEvents.has(evt.type)) return null;
    const obj = evt.data?.object;
    // Only credit a session that is actually paid.
    if (obj?.payment_status !== "paid" && obj?.payment_status !== "no_payment_required") {
      return null;
    }
    const depId = obj?.client_reference_id ?? obj?.metadata?.deposit_id;
    return depId ? Number(depId) : null;
  } catch {
    return null;
  }
}
