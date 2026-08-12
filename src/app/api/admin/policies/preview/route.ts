// Server-side Markdown preview for the policy editor. The renderer lives in
// @/lib/md (Node-only), so the client posts its draft here instead of importing
// it. Output HTML is already escaped by renderMarkdown and safe to inject.

import { isAdminAuthed } from "@/lib/admin";
import { renderMarkdown } from "@/lib/md";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { bodyMd?: unknown } | null;
  const html = renderMarkdown(String(body?.bodyMd ?? ""));
  return Response.json({ html });
}
