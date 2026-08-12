import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import { getFeedConfig } from "@/lib/feedcfg";
import FeedConfigForm from "@/components/admin/FeedConfigForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Лайв-лента — Админка BGASkins",
  robots: { index: false, follow: false },
};

export default async function AdminFeedPage() {
  await requireAdminPage();

  const initial = getFeedConfig();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Лайв-лента</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Параметры генератора событий ленты покупок: тайминг, отбор предметов и
          пул никнеймов.
        </p>
      </header>

      <FeedConfigForm initial={initial} />
    </div>
  );
}
