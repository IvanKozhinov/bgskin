// Admin single-policy endpoint. DELETE removes a policy by slug.

import { isAdminAuthed } from "@/lib/admin";
import { removePolicy } from "@/lib/policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await ctx.params;
  removePolicy(slug);
  return Response.json({ ok: true });
}
