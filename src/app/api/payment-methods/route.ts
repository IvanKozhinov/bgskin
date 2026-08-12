// GET /api/payment-methods — available deposit methods with configured state.

import { listPaymentMethods } from "@/lib/payments";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json({ methods: listPaymentMethods() });
}
