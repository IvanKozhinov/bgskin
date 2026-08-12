import { isAdminAuthed } from "@/lib/admin";
import { getAdmin, setAdminTotp } from "@/lib/db";
import { generateTotpSecret, totpQrDataUrl } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }
  const admin = getAdmin();
  if (!admin) {
    return Response.json({ ok: false, error: "Админ не найден" }, { status: 500 });
  }

  // Fresh secret, stored but not yet enabled — activation happens in /enable
  // once the admin proves they scanned it with a valid code.
  const secret = generateTotpSecret();
  setAdminTotp(secret, false);

  const qr = await totpQrDataUrl(admin.username, secret);
  return Response.json({ qr, secret });
}
