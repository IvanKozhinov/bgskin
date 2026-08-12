// POST /api/deposit — create a top-up intent for the logged-in user.

import { logEvent } from "@/lib/events";
import { createDepositIntent } from "@/lib/payments";
import { getSessionSteamId } from "@/lib/session";
import type { PaymentMethodId } from "@/lib/types";

export const runtime = "nodejs";

const METHODS: readonly PaymentMethodId[] = ["sbp", "card", "stripe", "heleket"];

function isMethod(value: unknown): value is PaymentMethodId {
  return typeof value === "string" && (METHODS as readonly string[]).includes(value);
}

export async function POST(request: Request): Promise<Response> {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return Response.json({ ok: false, error: "Не авторизован" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Некорректный запрос" }, { status: 400 });
  }

  const { amountCents, method } = (body ?? {}) as {
    amountCents?: unknown;
    method?: unknown;
  };

  if (!isMethod(method)) {
    return Response.json({ ok: false, error: "Неизвестный способ оплаты" }, { status: 400 });
  }

  const amount = Number(amountCents);
  const result = await createDepositIntent({ steamId, amountCents: amount, method });

  await logEvent(request, {
    steamId,
    type: "deposit_created",
    meta: { method, amountCents: amount },
  });

  return Response.json(result);
}
