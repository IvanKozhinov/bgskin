import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-guard";
import { adminStats, listRecentEvents } from "@/lib/db";
import EventTable from "@/components/admin/EventTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Панель — BGASkins.cc",
};

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="panel p-5">
      <div className="text-xs uppercase tracking-wider text-ink-faint">{label}</div>
      <div className={`mt-2 font-display text-3xl font-bold tabular-nums ${accent}`}>
        {value.toLocaleString("ru-RU")}
      </div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  await requireAdminPage();

  const stats = adminStats();
  const events = listRecentEvents(30);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold">Панель управления</h1>
      <p className="mt-1 text-sm text-ink-dim">Обзор магазина и последняя активность</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Пользователи" value={stats.users} accent="text-ink" />
        <StatCard label="Заказы" value={stats.orders} accent="text-accent" />
        <StatCard label="Депозиты" value={stats.deposits} accent="text-violet" />
        <StatCard label="События" value={stats.events} accent="text-pos" />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 font-display text-lg font-semibold">Последние события</h2>
        <EventTable events={events} showUser />
      </div>
    </div>
  );
}
