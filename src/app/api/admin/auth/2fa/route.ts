import {
  checkAdminTotp,
  createAdminSession,
  getAdminSession,
  rateLimitAttempt,
  rateLimitReset,
} from "@/lib/admin";
import { clientIp } from "@/lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: "Сессия не найдена" }, { status: 401 });
  }

  const ip = clientIp(request.headers) ?? "unknown";
  if (!rateLimitAttempt(`2fa:${ip}`)) {
    return Response.json(
      { ok: false, error: "Слишком много попыток. Попробуйте через несколько минут." },
      { status: 429 },
    );
  }

  let token: unknown;
  try {
    const body = (await request.json()) as { token?: unknown } | null;
    token = body?.token;
  } catch {
    token = undefined;
  }

  if (typeof token === "string" && checkAdminTotp(token)) {
    rateLimitReset(`2fa:${ip}`);
    await createAdminSession(session.username, true);
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: "Неверный код" }, { status: 401 });
}
