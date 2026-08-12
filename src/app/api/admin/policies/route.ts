// Admin policy collection endpoint.
// GET  → list every policy (including unpublished) for the admin table.
// POST → create or update a policy (upsert keyed by slug).

import { isAdminAuthed } from "@/lib/admin";
import { listPolicies, savePolicy } from "@/lib/policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

function forbidden(): Response {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(): Promise<Response> {
  if (!(await isAdminAuthed())) return forbidden();
  return Response.json({ policies: listPolicies(true) });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthed())) return forbidden();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ ok: false, error: "Некорректный запрос" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim();
  const title = String(body.title ?? "").trim();
  const bodyMd = String(body.bodyMd ?? "");
  const published = body.published === true;
  const showInFaq = body.showInFaq === true;
  const rawOrder = Number(body.sortOrder);
  const sortOrder = Number.isFinite(rawOrder) ? Math.trunc(rawOrder) : 0;

  if (!SLUG_RE.test(slug)) {
    return Response.json(
      { ok: false, error: "Slug: 2–40 символов, только строчные латинские буквы, цифры и дефис" },
      { status: 400 },
    );
  }
  if (!title) {
    return Response.json({ ok: false, error: "Введите заголовок" }, { status: 400 });
  }

  savePolicy({ slug, title, bodyMd, published, showInFaq, sortOrder });
  return Response.json({ ok: true });
}
