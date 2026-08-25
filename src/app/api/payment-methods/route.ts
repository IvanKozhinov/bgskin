// GET /api/payment-methods — available deposit methods with configured state,
// plus the deposit limits. The client must not hardcode limits of its own:
// a copy that drifts from the server rejects (or accepts) the wrong amounts.

import { listPaymentMethods, MAX_DEPOSIT_CENTS, MIN_DEPOSIT_CENTS } from "@/lib/payments";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({
    methods: listPaymentMethods(),
    minCents: MIN_DEPOSIT_CENTS,
    maxCents: MAX_DEPOSIT_CENTS,
  });
}
