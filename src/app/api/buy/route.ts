// POST /api/buy — purchase an item.
// Demo mode: instant fake delivery from balance.
// Live mode: debit → find cheapest matching Skinsback offer → market_buy;
// any failure after the debit refunds the balance.

import { randomUUID } from "node:crypto";
import { isSkinsbackLive } from "@/lib/config";
import { getItemById } from "@/lib/catalog";
import {
  createOrder,
  credit,
  getOrderById,
  getUser,
  setOrderSkinsbackId,
  tryDebit,
  updateOrderStatus,
} from "@/lib/db";
import { getSessionSteamId } from "@/lib/session";
import { parseTradeUrl, sbBuyById, sbSearch } from "@/lib/skinsback";
import type { BuyResponse } from "@/lib/types";

export const runtime = "nodejs";

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
    try {
      const body = (await request.json()) as { itemId?: unknown };
      itemId = body?.itemId;
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
      const results = await sbSearch(item.name);
      const prefix = `${item.name} (`;
      const candidates = results.filter(
        (r) =>
          r.name.startsWith(prefix) &&
          !r.name.includes("StatTrak") &&
          !r.name.includes("Souvenir"),
      );
      if (candidates.length === 0) {
        credit(steamId, item.priceCents);
        updateOrderStatus({ customId, status: "failed" });
        return json({ ok: false, error: "Предмет сейчас недоступен" }, 409);
      }
      const cheapest = candidates.reduce((a, b) => (b.price < a.price ? b : a));

      const maxPriceUsd = (item.priceCents / 100) * 1.07; // 7% slippage guard
      const bought = await sbBuyById({
        id: cheapest.id,
        maxPriceUsd,
        partner: trade.partner,
        token: trade.token,
        customId,
      });

      setOrderSkinsbackId(order.id, bought.buyId);
      updateOrderStatus({ customId, status: "processing" });

      const freshOrder = getOrderById(order.id) ?? { ...order, status: "processing" as const };
      const newBalanceCents = getUser(steamId)?.balance_cents ?? 0;
      return json({ ok: true, order: freshOrder, newBalanceCents });
    } catch (err) {
      console.error("[buy] live purchase failed, refunding:", err);
      credit(steamId, item.priceCents);
      updateOrderStatus({ customId, status: "failed" });
      return json({ ok: false, error: "Не удалось купить предмет, средства возвращены" }, 502);
    }
  } catch (err) {
    console.error("[buy] unhandled error:", err);
    return json({ ok: false, error: "Внутренняя ошибка сервера" }, 500);
  }
}
