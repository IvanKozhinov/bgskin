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
  if (!admin?.totp_secret) {
    return Response.json({ ok: false, error: "Сначала сгенерируйте секрет" }, { status: 400 });
  }

  let token: unknown;
  try {
    const body = (await request.json()) as { token?: unknown } | null;
    token = body?.token;
  } catch {
    token = undefined;
  }

  if (typeof token === "string" && verifyTotp(token, admin.totp_secret)) {
    setAdminTotp(admin.totp_secret, true);
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: "Неверный код" }, { status: 400 });
}
