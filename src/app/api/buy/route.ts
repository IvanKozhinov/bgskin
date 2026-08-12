// POST /api/buy — purchase an item.
// Demo mode: instant fake delivery from balance.
// Live mode: debit → find cheapest matching Skinsback offer → market_buy.
//   - definitive API rejection → atomic refund;
//   - ambiguous failure (timeout/network) → order left pending, NO blind refund
//     (the purchase may have succeeded); reconciled via sbOrderInfo / webhook.

import { randomUUID } from "node:crypto";
import { isSkinsbackLive } from "@/lib/config";
import { getItemById } from "@/lib/catalog";
import {
  advanceOrderStatus,
  createOrder,
  failAndRefundOnce,
  getOrderById,
  getUser,
  setOrderSkinsbackId,
  tryDebit,
} from "@/lib/db";
import { getSessionSteamId } from "@/lib/session";
import {
  parseTradeUrl,
  sbBuyById,
  sbOrderInfo,
  sbSearch,
  SkinsbackApiError,
} from "@/lib/skinsback";
import type { BuyResponse, CatalogItem } from "@/lib/types";

export const runtime = "nodejs";

// Offer statuses that mean the purchase definitively did not / will not deliver.
const FAILED_OFFER = new Set([
  "canceled",
  "timeout",
  "invalid_trade_token",
  "user_not_tradable",
  "trade_create_error",
  "rollback_user",
  "rollback_supplier",
]);

// Allowed drift between the price the user was shown and the current server
// price before we ask them to re-confirm (0.5%, min 1 cent). Guards against
// the demo/live price wobble charging a different amount than displayed.
function priceMismatch(expected: number, current: number): boolean {
  return Math.abs(expected - current) > Math.max(1, Math.round(current * 0.005));
}

function json(body: BuyResponse, status = 200): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const steamId = await getSessionSteamId();
    if (!steamId) {
      return json({ ok: false, error: "Войдите через Steam, чтобы совершать покупки" }, 401);
    }

    let itemId: unknown;
    let expectedPriceCents: number | undefined;
    try {
      const body = (await request.json()) as {
        itemId?: unknown;
        expectedPriceCents?: unknown;
      };
      itemId = body?.itemId;
      if (typeof body?.expectedPriceCents === "number" && Number.isFinite(body.expectedPriceCents)) {
        expectedPriceCents = Math.round(body.expectedPriceCents);
      }
    } catch {
      return json({ ok: false, error: "Некорректный запрос" }, 400);
    }
    if (typeof itemId !== "string" || itemId.length === 0) {
      return json({ ok: false, error: "Не указан предмет" }, 400);
    }

    const item = await getItemById(itemId);
    if (!item) {
      return json({ ok: false, error: "Предмет не найден" }, 404);
    }
    if (item.available === false || item.priceCents <= 0) {
      return json({ ok: false, error: "Предмет сейчас недоступен для покупки" }, 409);
    }

    // Price the user saw must still match (protects against wobble / live moves).
    if (expectedPriceCents !== undefined && priceMismatch(expectedPriceCents, item.priceCents)) {
      return json(
        {
          ok: false,
          error: "Цена изменилась. Проверьте новую цену и подтвердите покупку заново.",
          priceChanged: true,
          currentPriceCents: item.priceCents,
        },
        409,
      );
    }

    // ---- DEMO MODE: instant delivery from fake balance -------------------
    if (!isSkinsbackLive()) {
      if (!tryDebit(steamId, item.priceCents)) {
        return json({ ok: false, error: "Недостаточно средств" }, 402);
      }
      const order = createOrder({
        userSteamId: steamId,
        itemId: item.id,
        itemName: item.name,
        priceCents: item.priceCents,
        status: "demo_delivered",
      });
      const newBalanceCents = getUser(steamId)?.balance_cents ?? 0;
      return json({ ok: true, order, newBalanceCents });
    }

    // ---- LIVE MODE: real Skinsback purchase ------------------------------
    return await liveBuy(steamId, item);
  } catch (err) {
    console.error("[buy] unhandled error:", err);
    return json({ ok: false, error: "Внутренняя ошибка сервера" }, 500);
  }
}

async function liveBuy(steamId: string, item: CatalogItem): Promise<Response> {
  const user = getUser(steamId);
  if (!user?.trade_url) {
    return json(
      { ok: false, error: "Укажите трейд-ссылку Steam в профиле, чтобы получать предметы" },
      400,
    );
  }
  const trade = parseTradeUrl(user.trade_url);
  if (!trade) {
    return json(
      { ok: false, error: "Трейд-ссылка в профиле некорректна — обновите её и попробуйте снова" },
      400,
    );
  }

  // Find a purchasable offer BEFORE debiting, so an out-of-stock item never
  // touches the balance (no debit/refund churn).
  let cheapestId: string;
  let cheapestPriceUsd: number;
  try {
    const results = await sbSearch(item.name);
    const prefix = `${item.name} (`;
    const candidates = results.filter(
      (r) =>
        (r.name === item.name || r.name.startsWith(prefix)) &&
        !r.name.includes("StatTrak") &&
        !r.name.includes("Souvenir"),
    );
    if (candidates.length === 0) {
      return json({ ok: false, error: "Предмет сейчас недоступен" }, 409);
    }
    const cheapest = candidates.reduce((a, b) => (b.price < a.price ? b : a));
    cheapestId = cheapest.id;
    cheapestPriceUsd = cheapest.price;
  } catch (err) {
    console.error("[buy] search failed:", err);
    return json({ ok: false, error: "Магазин временно недоступен, попробуйте позже" }, 502);
  }

  // Guard against paying materially more than the displayed price.
  const maxPriceUsd = (item.priceCents / 100) * 1.07; // 7% slippage cap
  if (cheapestPriceUsd > maxPriceUsd) {
    return json(
      {
        ok: false,
        error: "Цена изменилась. Обновите страницу и подтвердите покупку заново.",
        priceChanged: true,
        currentPriceCents: Math.round(cheapestPriceUsd * 100),
      },
      409,
    );
  }

  if (!tryDebit(steamId, item.priceCents)) {
    return json({ ok: false, error: "Недостаточно средств" }, 402);
  }

  const customId = randomUUID();
  const order = createOrder({
    userSteamId: steamId,
    itemId: item.id,
    itemName: item.name,
    priceCents: item.priceCents,
    status: "pending",
    customId,
  });

  try {
    const bought = await sbBuyById({
      id: cheapestId,
      maxPriceUsd,
      partner: trade.partner,
      token: trade.token,
      customId,
    });
    setOrderSkinsbackId(order.id, bought.buyId);
    advanceOrderStatus(customId, "processing");
    const freshOrder = getOrderById(order.id) ?? { ...order, status: "processing" as const };
    const newBalanceCents = getUser(steamId)?.balance_cents ?? 0;
    return json({ ok: true, order: freshOrder, newBalanceCents });
  } catch (err) {
    // Definitive API rejection: no purchase was made → atomic single refund.
    if (err instanceof SkinsbackApiError) {
      failAndRefundOnce(customId);
      return json({ ok: false, error: "Не удалось купить предмет, средства возвращены" }, 502);
    }

    // Ambiguous failure (timeout/network/parse): the purchase MAY have gone
    // through. Do NOT blind-refund. Try to reconcile once; otherwise leave the
    // order pending for the webhook / a later status check to settle.
    console.warn("[buy] ambiguous market_buy failure, reconciling:", err);
    try {
      const info = await sbOrderInfo(customId);
      if (info.buyId) setOrderSkinsbackId(order.id, info.buyId);
      if (FAILED_OFFER.has(info.offerStatus)) {
        failAndRefundOnce(customId);
        return json({ ok: false, error: "Покупка не удалась, средства возвращены" }, 502);
      }
      // Purchase exists and is progressing.
      advanceOrderStatus(customId, "processing");
      const freshOrder = getOrderById(order.id) ?? { ...order, status: "processing" as const };
      return json({ ok: true, pending: true, order: freshOrder });
    } catch {
      // Could not confirm either way: keep the order pending (no refund). The
      // webhook, or a reconciliation pass, will finalize it.
      return json(
        {
          ok: false,
          pending: true,
          error:
            "Покупка обрабатывается. Если предмет не придёт в течение 15 минут, средства вернутся автоматически.",
        },
        202,
      );
    }
  }
}
