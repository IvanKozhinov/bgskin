// GET/POST /api/admin/integrations — provider credentials managed from the panel.
//
// Values are never echoed back: the GET returns only whether a credential is
// set, where it comes from (panel or env) and a masked hint. POST accepts new
// values; an empty string clears the stored value (falling back to env).
// POST { test: "skinsback" } runs a real API call to verify the credentials.

import { isAdminAuthed } from "@/lib/admin";
import { logEvent } from "@/lib/events";
import {
  invalidateProviderCaches,
  isSkinsbackLive,
  setSetting,
  settingStatus,
  type SecretName,
} from "@/lib/settings";
import { sbPricelist } from "@/lib/skinsback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDITABLE: SecretName[] = [
  "skinsback_shop_id",
  "skinsback_secret",
  "stripe_secret_key",
  "stripe_publishable_key",
  "stripe_webhook_secret",
  "heleket_merchant_id",
  "heleket_api_key",
  "sbp_shop_id",
  "sbp_secret",
];

function snapshot() {
  return {
    settings: EDITABLE.map(settingStatus),
    skinsbackLive: isSkinsbackLive(),
  };
}

/** Turn Skinsback's terse error codes into something an operator can act on. */
function humanizeSkinsbackError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid_shopid") || m.includes("-2")) return "Неверный Shop ID.";
  if (m.includes("invalid_secret") || m.includes("-10")) return "Неверный секретный ключ.";
  if (m.includes("invalid signature") || m.includes("invalid_sign") || m.includes("-3")) {
    return "Подпись отклонена — проверьте секретный ключ.";
  }
  if (m.includes("inactive") || m.includes("-4")) return "Магазин неактивен в кабинете Skinsback.";
  if (m.includes("invalid_ip") || m.includes("-8")) {
    return "IP сервера не в белом списке Skinsback — добавьте его в кабинете.";
  }
  if (m.includes("-9") || m.includes("maintenance")) return "Skinsback на техобслуживании.";
  if (m.includes("-7") || m.includes("rate")) return "Слишком много запросов, попробуйте позже.";
  return message;
}

/** Live check against market_pricelist. Never throws. */
async function testSkinsback(): Promise<{ ok: boolean; message: string; items?: number }> {
  if (!isSkinsbackLive()) {
    return { ok: false, message: "Укажите Shop ID и секретный ключ Skinsback, затем сохраните." };
  }
  try {
    const { items } = await sbPricelist();
    return {
      ok: true,
      items: items.length,
      message: `Подключение работает: ${items.length} позиций в прайсе.`,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Не удалось связаться со Skinsback";
    return { ok: false, message: humanizeSkinsbackError(raw) };
  }
}

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }
  return Response.json(snapshot());
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Некорректный запрос" }, { status: 400 });
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  // ---- connection test -------------------------------------------------------
  if (b.test === "skinsback") {
    const r = await testSkinsback();
    return Response.json(
      r.ok ? { ok: true, message: r.message, items: r.items } : { ok: false, error: r.message },
    );
  }

  // ---- save --------------------------------------------------------------
  const changed: SecretName[] = [];
  for (const name of EDITABLE) {
    if (!(name in b)) continue;
    const raw = b[name];
    if (typeof raw !== "string") continue;
    setSetting(name, raw.trim() === "" ? null : raw);
    changed.push(name);
  }

  if (changed.length > 0) {
    // New credentials must take effect now, not after the price/catalog TTL.
    invalidateProviderCaches();
    // Audit trail: record WHICH credentials changed, never their values.
    await logEvent(request, { type: "admin_settings_changed", meta: { keys: changed } });
  }

  // Changing Skinsback keys switches the whole storefront to live pricing, and
  // bad keys mean an empty catalogue — so verify immediately and say so.
  const touchedSkinsback = changed.some((k) => k.startsWith("skinsback_"));
  const verify = touchedSkinsback ? await testSkinsback() : null;

  return Response.json({
    ok: true,
    changed,
    ...snapshot(),
    ...(verify
      ? {
          verify: {
            ok: verify.ok,
            message: verify.ok
              ? verify.message
              : `${verify.message} Пока ключи не работают, каталог будет пустым.`,
          },
        }
      : {}),
  });
}
