import { checkAdminPassword, createAdminSession } from "@/lib/admin";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
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
    return Response.json({ ok: false, error: "Неверный логин или пароль" }, { status: 401 });
  }

  // mfa is satisfied immediately only when 2FA is not required for this admin.
  await createAdminSession(username, !r.totpRequired);
  await logEvent(request, { type: "admin_login", meta: { username } });

  return Response.json({ ok: true, totpRequired: r.totpRequired });
}
