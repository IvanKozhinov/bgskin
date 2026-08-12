import { setTradeUrl } from "@/lib/db";
import { getSessionSteamId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRADE_URL_RE =
  /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[A-Za-z0-9_-]{5,}$/;

export async function POST(request: Request): Promise<Response> {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return Response.json(
      { ok: false, error: "Требуется вход через Steam" },
      { status: 401 },
    );
  }

  let tradeUrl: unknown;
  try {
    const body = (await request.json()) as { tradeUrl?: unknown } | null;
    tradeUrl = body?.tradeUrl;
  } catch {
    tradeUrl = undefined;
  }

  if (typeof tradeUrl !== "string" || !TRADE_URL_RE.test(tradeUrl)) {
    return Response.json(
      {
        ok: false,
        error:
          "Неверный формат трейд-ссылки. Скопируйте её из Steam: Инвентарь → Предложения обмена → Кто может отправлять мне предложения.",
      },
      { status: 400 },
    );
  }

  setTradeUrl(steamId, tradeUrl);
  return Response.json({ ok: true });
}
