// Admin → Policies → editor. slug "new" opens a blank editor; any other slug
// loads the existing policy (404 when missing).

import { notFound, redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin";
import { getPolicy } from "@/lib/policies";
import PolicyEditor, { type PolicyInitial } from "@/components/admin/PolicyEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLANK: PolicyInitial = {
  slug: "",
  title: "",
  bodyMd: "",
  published: false,
  showInFaq: false,
  sortOrder: 0,
};

export default async function AdminPolicyEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await isAdminAuthed())) redirect("/admin/login");

  const { slug } = await params;
  const isNew = slug === "new";

  let initial: PolicyInitial = BLANK;
  if (!isNew) {
    const p = getPolicy(slug);
    if (!p) notFound();
    initial = {
      slug: p.slug,
      title: p.title,
      bodyMd: p.bodyMd,
      published: p.published,
      showInFaq: p.showInFaq,
      sortOrder: p.sortOrder,
    };
  }

  return <PolicyEditor initial={initial} isNew={isNew} />;
}
