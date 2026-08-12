import { isAdminAuthed } from "@/lib/admin";
import { getAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }
  return Response.json({ enabled: getAdmin()?.totp_enabled === 1 });
}
