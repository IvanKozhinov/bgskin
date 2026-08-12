// POST /api/deposit/webhook/stripe — Stripe checkout.session.completed callback.
// Verifies the signature, then credits the deposit exactly once. Balance moves
// only here, on a verified provider callback — never optimistically.

import { markDepositPaidOnce } from "@/lib/db";
import { verifyStripeWebhook } from "@/lib/payments";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const depositId = verifyStripeWebhook(raw, request.headers.get("stripe-signature"));
  if (depositId !== null) {
    markDepositPaidOnce(depositId);
  }
  return Response.json({ received: true });
}
