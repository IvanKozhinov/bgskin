import { checkAdminTotp, createAdminSession, getAdminSession } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const session = await getAdminSession();
  if (!session) {
    return Response.json({ ok: false, error: "Сессия не найдена" }, { status: 401 });
  }

  let token: unknown;
  try {
    const body = (await request.json()) as { token?: unknown } | null;
    token = body?.token;
  } catch {
    token = undefined;
  }

  if (typeof token === "string" && checkAdminTotp(token)) {
    await createAdminSession(session.username, true);
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: "Неверный код" }, { status: 401 });
}
