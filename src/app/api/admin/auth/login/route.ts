import {
  adminNeedsEnrollment,
  checkAdminPassword,
  createAdminSession,
  rateLimitAttempt,
  rateLimitReset,
} from "@/lib/admin";
import { logEvent } from "@/lib/events";
import { clientIp } from "@/lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request.headers) ?? "unknown";
  if (!rateLimitAttempt(`login:${ip}`)) {
    return Response.json(
      { ok: false, error: "Слишком много попыток. Попробуйте через несколько минут." },
      { status: 429 },
    );
  }

  let username: unknown;
  let password: unknown;
  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown } | null;
    username = body?.username;
    password = body?.password;
  } catch {
    username = undefined;
    password = undefined;
  }

  if (typeof username !== "string" || typeof password !== "string") {
    return Response.json({ ok: false, error: "Неверный логин или пароль" }, { status: 401 });
  }

  const r = checkAdminPassword(username, password);
  if (!r.ok) {
    await logEvent(request, { type: "admin_login_failed", meta: { username } });
    return Response.json({ ok: false, error: "Неверный логин или пароль" }, { status: 401 });
  }
  rateLimitReset(`login:${ip}`);

  // mfa is satisfied immediately only when 2FA is not required for this admin.
  await createAdminSession(username, !r.totpRequired);
  await logEvent(request, { type: "admin_login", meta: { username } });

  // When the deployment mandates 2FA but this admin hasn't enrolled, the client
  // must send them through enrolment before the panel is usable.
  const mustEnroll = await adminNeedsEnrollment();
  return Response.json({ ok: true, totpRequired: r.totpRequired, mustEnroll });
}
