// POST /api/buy — purchase an item with the user's balance.
// A trade link and sufficient balance are required. Delivery is via Skinsback;
// definitive API rejections refund atomically, ambiguous failures leave the
// order pending (no blind refund). No demo/instant path.

import { randomUUID } from "node:crypto";
import { isSkinsbackLive } from "@/lib/settings";
import { getItemForPurchase, markItemUnavailable } from "@/lib/catalog";
import {
  advanceOrderStatus,
  createOrder,
  failAndRefundOnce,
  getOrderById,
  getUser,
  setOrderSkinsbackId,
  setOrderTradeOfferId,
  tryDebit,
} from "@/lib/db";
import { getSessionSteamId } from "@/lib/session";
import { getPricingConfig, maxAcceptableCostCents, retailCents } from "@/lib/pricing";
import { rubKopecksToUsdCents, usdCentsToRubKopecks, usdToRub } from "@/lib/currency";
import { logEvent } from "@/lib/events";
import {
  parseTradeUrl,
  sbBuyById,
  sbOrderInfo,
  sbSearch,
  SkinsbackApiError,
} from "@/lib/skinsback";
import type { BuyResponse, CatalogItem } from "@/lib/types";

export const runtime = "nodejs";

const FAILED_OFFER = new Set([
  "canceled",
  "timeout",
  "invalid_trade_token",
  "user_not_tradable",
  "trade_create_error",
  "rollback_user",
  "rollback_supplier",
]);

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
      const body = (await request.json()) as { itemId?: unknown; expectedPriceCents?: unknown };
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

    // Server-side lookup: keeps costCents so we can cap what we pay Skinsback.
    const item = await getItemForPurchase(itemId);
    if (!item) return json({ ok: false, error: "Предмет не найден" }, 404);
    if (item.available === false || item.priceCents <= 0) {
      return json({ ok: false, error: "Предмет сейчас недоступен для покупки" }, 409);
    }

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

    const user = getUser(steamId);

    // Trade link is mandatory — warn the user explicitly if it's missing.
    if (!user?.trade_url) {
      return json(
        {
          ok: false,
          needsTradeUrl: true,
          error: "Укажите трейд-ссылку Steam — без неё мы не сможем отправить предмет.",
        },
        400,
      );
    }
    const trade = parseTradeUrl(user.trade_url);
    if (!trade) {
      return json(
        {
          ok: false,
          needsTradeUrl: true,
          error: "Трейд-ссылка в профиле некорректна — обновите её и попробуйте снова.",
        },
        400,
      );
    }

    // Balance check before anything else (no debit yet).
    if (user.balance_cents < item.priceCents) {
      return json(
        {
          ok: false,
          needsDeposit: true,
          error: "Недостаточно средств. Пополните баланс, чтобы купить предмет.",
        },
        402,
      );
    }

    // Delivery requires Skinsback to be connected.
    if (!isSkinsbackLive()) {
      return json(
        {
          ok: false,
          fulfillmentUnavailable: true,
          error: "Выдача предметов ещё подключается. Покупка временно недоступна.",
        },
        503,
      );
    }

    await logEvent(request, {
      steamId,
      type: "buy_attempt",
      meta: { itemId: item.id, itemName: item.name, priceCents: item.priceCents },
    });

    return await liveBuy(steamId, item, trade);
  } catch (err) {
    console.error("[buy] unhandled error:", err);
    return json({ ok: false, error: "Внутренняя ошибка сервера" }, 500);
  }
}

async function liveBuy(
  steamId: string,
  item: CatalogItem,
  trade: { partner: string; token: string },
): Promise<Response> {
  // Two currencies in play: the buyer pays roubles, Skinsback charges dollars.
  // costCents is USD; priceCents is RUB kopecks. Everything compared against the
  // provider must be converted to USD first.
  const cfg = getPricingConfig();
  const rate = await usdToRub();
  const buyerPaidUsdCents = rubKopecksToUsdCents(item.priceCents, rate);
  const costBasisCents =
    item.costCents && item.costCents > 0 ? item.costCents : buyerPaidUsdCents;

  // Find a purchasable offer BEFORE debiting.
  let cheapestId: string;
  let cheapestPriceUsd: number;
  try {
    // Skinsback's market_search matches the FULL market name only: searching
    // "AK-47 | Redline" returns nothing, "AK-47 | Redline (Field-Tested)" works.
    // The catalog records the exact cheapest listing, so use that.
    const searchName = item.sourceName ?? item.name;
    const results = await sbSearch(searchName);
    const prefix = `${item.name} (`;
    // Match the variant we are actually selling: a StatTrak listing must buy a
    // StatTrak offer, and a plain listing must never buy one by accident.
    const wantStatTrak = item.name.includes("StatTrak");
    const wantSouvenir = item.name.includes("Souvenir");
    const candidates = results.filter(
      (r) =>
        (r.name === searchName || r.name === item.name || r.name.startsWith(prefix)) &&
        r.name.includes("StatTrak") === wantStatTrak &&
        r.name.includes("Souvenir") === wantSouvenir,
    );
    if (candidates.length === 0) {
      // Sold out since the last price refresh — take it off the storefront now.
      await markItemUnavailable(item.id);
      return json({ ok: false, error: "Предмет только что раскупили — он снят с витрины" }, 409);
    }
    const cheapest = candidates.reduce((a, b) => (b.price < a.price ? b : a));
    cheapestId = cheapest.id;
    cheapestPriceUsd = cheapest.price;
  } catch (err) {
    console.error("[buy] search failed:", err);
    return json({ ok: false, error: "Магазин временно недоступен, попробуйте позже" }, 502);
  }

  // Capped by what the buyer paid (converted to USD): a slip we accept must
  // never exceed the sale.
  const maxCostCents = maxAcceptableCostCents(costBasisCents, cfg, buyerPaidUsdCents);
  const maxPriceUsd = maxCostCents / 100;
  if (Math.round(cheapestPriceUsd * 100) > maxCostCents) {
    // Cost moved beyond the allowed slippage — quote the buyer the new price
    // (cost + markup), not the raw cost.
    return json(
      {
        ok: false,
        error: "Цена изменилась. Обновите страницу и подтвердите покупку заново.",
        priceChanged: true,
        currentPriceCents: retailCents(
          usdCentsToRubKopecks(Math.round(cheapestPriceUsd * 100), rate),
          cfg,
        ),
      },
      409,
    );
  }

  if (!tryDebit(steamId, item.priceCents)) {
    return json(
      { ok: false, needsDeposit: true, error: "Недостаточно средств. Пополните баланс." },
      402,
    );
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
    setOrderTradeOfferId(customId, bought.tradeOfferId);

    // market_buy can come back already terminal (bad trade token, user not
    // tradable, trade_create_error…). Reporting success there would leave the
    // buyer paying for an offer that will never arrive.
    if (FAILED_OFFER.has(bought.offerStatus)) {
      failAndRefundOnce(customId);
      return json(
        { ok: false, error: "Не удалось создать трейд-оффер, средства возвращены" },
        502,
      );
    }
    if (bought.offerStatus === "accepted") advanceOrderStatus(customId, "delivered");
    else if (bought.offerStatus === "waiting_accept") advanceOrderStatus(customId, "sent");
    else advanceOrderStatus(customId, "processing");

    const freshOrder = getOrderById(order.id) ?? { ...order, status: "processing" as const };
    const newBalanceCents = getUser(steamId)?.balance_cents ?? 0;
    return json({ ok: true, order: freshOrder, newBalanceCents });
  } catch (err) {
    if (err instanceof SkinsbackApiError) {
      failAndRefundOnce(customId);
      return json({ ok: false, error: "Не удалось купить предмет, средства возвращены" }, 502);
    }
    console.warn("[buy] ambiguous market_buy failure, reconciling:", err);
    try {
      const info = await sbOrderInfo(customId);
      if (info.buyId) setOrderSkinsbackId(order.id, info.buyId);
      setOrderTradeOfferId(customId, info.tradeOfferId);
      if (FAILED_OFFER.has(info.offerStatus)) {
        failAndRefundOnce(customId);
        return json({ ok: false, error: "Покупка не удалась, средства возвращены" }, 502);
      }
      advanceOrderStatus(customId, "processing");
      const freshOrder = getOrderById(order.id) ?? { ...order, status: "processing" as const };
      return json({ ok: true, pending: true, order: freshOrder });
    } catch {
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
