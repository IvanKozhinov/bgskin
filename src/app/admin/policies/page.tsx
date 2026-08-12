// Admin → Policies. Lists every policy (published + drafts) with edit links.

import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin";
import { listPolicies } from "@/lib/policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminPoliciesPage() {
  if (!(await isAdminAuthed())) redirect("/admin/login");

  const policies = listPolicies(true);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Политики и документы</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Публичные страницы, футер и раздел FAQ формируются из этих документов.
          </p>
        </div>
        <Link href="/admin/policies/new" className="btn-primary">
          Создать политику
        </Link>
      </div>

      <div className="panel mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left font-display text-xs uppercase tracking-widest text-ink-faint">
                <th className="px-4 py-3 font-semibold">Заголовок</th>
                <th className="px-4 py-3 font-semibold">Slug</th>
                <th className="px-4 py-3 font-semibold">Статус</th>
                <th className="px-4 py-3 font-semibold">FAQ</th>
                <th className="px-4 py-3 text-right font-semibold">Порядок</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {policies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-dim">
                    Пока нет ни одного документа.
                  </td>
                </tr>
              ) : (
                policies.map((p) => (
                  <tr
                    key={p.slug}
                    className="border-b border-line/60 transition-colors last:border-0 hover:bg-panel-2/50"
                  >
                    <td className="px-4 py-3 font-medium text-ink">{p.title}</td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-bg-elevated px-1.5 py-0.5 font-mono text-xs text-ink-dim">
                        {p.slug}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      {p.published ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-pos/30 bg-pos/10 px-2.5 py-0.5 text-xs font-medium text-pos">
                          Опубликовано
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-line-bright bg-panel-2 px-2.5 py-0.5 text-xs font-medium text-ink-dim">
                          Черновик
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-dim">{p.showInFaq ? "Да" : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-dim">{p.sortOrder}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/policies/${p.slug}`}
                        className="font-display text-sm font-semibold text-accent transition-colors hover:text-accent-hot"
                      >
                        Редактировать
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
