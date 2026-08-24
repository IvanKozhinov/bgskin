import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import { listUsersForAdmin } from "@/lib/db";
import type { AdminUserRow } from "@/lib/types";
import UsersTable from "@/components/admin/UsersTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Пользователи — BGSkins.pro",
};

const PAGE_SIZE = 50;

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function AdminUsersPage({ searchParams }: Props) {
  await requireAdminPage();

  const sp = await searchParams;
  const q = first(sp.q).trim();
  const page = Math.max(1, parseInt(first(sp.page), 10) || 1);

  const rows: AdminUserRow[] = listUsersForAdmin({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: q || undefined,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold">Пользователи</h1>
      <p className="mt-1 text-sm text-ink-dim">
        Балансы, гео и активность зарегистрированных аккаунтов
      </p>

      <div className="mt-6">
        <UsersTable rows={rows} q={q} page={page} />
      </div>
    </div>
  );
}
