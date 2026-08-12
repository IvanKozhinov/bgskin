// GET /api/admin/users — admin-guarded users overview with search + paging.

import { isAdminAuthed } from "@/lib/admin";
import { listUsersForAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(request: Request): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const rows = listUsersForAdmin({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: q || undefined,
  });

  return Response.json({ rows, page });
}
