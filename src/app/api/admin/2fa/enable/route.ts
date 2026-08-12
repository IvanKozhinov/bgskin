import { createAdminSession, getAdminSession, hasAdminSession } from "@/lib/admin";
import { getAdmin, promoteAdminTotp } from "@/lib/db";
import { verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await hasAdminSession())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }
  const admin = getAdmin();
  if (!admin?.totp_pending_secret) {
    return Response.json({ ok: false, error: "Сначала сгенерируйте секрет" }, { status: 400 });
  }

  let token: unknown;
  try {
    const body = (await request.json()) as { token?: unknown } | null;
    token = body?.token;
  } catch {
    token = undefined;
  }

  if (typeof token === "string" && verifyTotp(token, admin.totp_pending_secret)) {
    promoteAdminTotp();
    // The admin just proved the second factor — mark this session mfa-satisfied
    // so they aren't immediately bounced to re-login.
    const s = await getAdminSession();
    if (s) await createAdminSession(s.username, true);
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: "Неверный код" }, { status: 400 });
}
