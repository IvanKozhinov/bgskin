import { hasAdminSession } from "@/lib/admin";
import { getAdmin, setAdminPendingTotp } from "@/lib/db";
import { generateTotpSecret, totpQrDataUrl } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST (not GET): staging a candidate secret is a state change, so it must not
// be reachable via a cross-site top-level navigation. The candidate goes to a
// PENDING slot and never touches the live secret / enabled flag until /enable
// confirms a valid code — an in-flight setup can't strip active 2FA.
export async function POST(): Promise<Response> {
  if (!(await hasAdminSession())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }
  const admin = getAdmin();
  if (!admin) {
    return Response.json({ ok: false, error: "Админ не найден" }, { status: 500 });
  }
  const secret = generateTotpSecret();
  setAdminPendingTotp(secret);
  const qr = await totpQrDataUrl(admin.username, secret);
  return Response.json({ qr, secret });
}
