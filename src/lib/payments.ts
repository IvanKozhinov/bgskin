// Payment/deposit orchestration. Methods activate when their provider keys are
// present; otherwise a deposit is recorded as "pending" and the UI shows an
// onboarding state. No fake crediting — balance moves only on a verified
// provider callback (markDepositPaidOnce).

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isHeleketConfigured,
  isSbpConfigured,
  isStripeConfigured,
  siteUrl,
  stripeSecretKey,
} from "./config";
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
  body.set("success_url", `${siteUrl()}/wallet?deposit=${depositId}&status=success`);
  body.set("cancel_url", `${siteUrl()}/wallet?deposit=${depositId}&status=cancel`);
  body.set("client_reference_id", String(depositId));
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", String(amountCents));
  body.set("line_items[0][price_data][product_data][name]", "Пополнение баланса BGASkins");
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

/**
 * Verify a Stripe webhook signature and return the paid deposit id, or null.
 * Requires STRIPE_WEBHOOK_SECRET.
 */
export function verifyStripeWebhook(rawBody: string, sigHeader: string | null): number | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !sigHeader) return null;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => kv.split("=").map((s) => s.trim()) as [string, string]),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return null;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const evt = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: { client_reference_id?: string; metadata?: { deposit_id?: string } } };
    };
    if (evt.type !== "checkout.session.completed") return null;
    const obj = evt.data?.object;
    const depId = obj?.client_reference_id ?? obj?.metadata?.deposit_id;
    return depId ? Number(depId) : null;
  } catch {
    return null;
  }
}
