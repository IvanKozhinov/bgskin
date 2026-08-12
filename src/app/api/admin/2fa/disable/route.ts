import { isAdminAuthed } from "@/lib/admin";
import { getAdmin, setAdminTotp } from "@/lib/db";
import { verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }
  const admin = getAdmin();

  let token: unknown;
  try {
    const body = (await request.json()) as { token?: unknown } | null;
    token = body?.token;
  } catch {
    token = undefined;
  }

  // When 2FA is currently active, require a valid code to turn it off.
  if (admin?.totp_enabled === 1 && admin.totp_secret) {
    if (typeof token !== "string" || !verifyTotp(token, admin.totp_secret)) {
      return Response.json({ ok: false, error: "Неверный код" }, { status: 400 });
    }
  }

  setAdminTotp(null, false);
  return Response.json({ ok: true });
}
