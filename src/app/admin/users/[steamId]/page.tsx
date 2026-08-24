import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser, listEventsByUser } from "@/lib/db";
import type { UserEvent } from "@/lib/types";
import { formatPrice } from "@/lib/types";
import EventTable from "@/components/admin/EventTable";
import { CopyButton } from "@/components/admin/UsersTable";
import { requireAdminPage } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Пользователь — BGSkins.pro",
};

type Props = { params: Promise<{ steamId: string }> };

function distinct(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    if (v) seen.add(v);
  }
  return [...seen];
}

export default async function AdminUserPage({ params }: Props) {
  await requireAdminPage();

  const { steamId } = await params;
  const u = getUser(steamId);
  if (!u) notFound();

  const events: UserEvent[] = listEventsByUser(steamId, 300);
  const countries = distinct(events.map((e) => e.country));
  const ips = distinct(events.map((e) => e.ip));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-ink-dim transition-colors hover:text-accent"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Все пользователи
      </Link>

      <div className="panel mt-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={u.avatar}
            alt=""
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-xl border border-line bg-panel-2 object-cover"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold">{u.name || "Без имени"}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-dim">{u.steam_id}</span>
              <CopyButton value={u.steam_id} label="Копировать ID" />
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-faint">Баланс</div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-accent">
              {formatPrice(u.balance_cents)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-faint">
              Трейд-ссылка
            </div>
            <div className="mt-1">
              {u.trade_url ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-pos">
                  <span className="h-2 w-2 rounded-full bg-pos" />
                  Указана
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-faint">
                  <span className="h-2 w-2 rounded-full bg-ink-faint" />
                  Нет
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-faint">Страны</div>
            <div
              className="mt-1 truncate font-mono text-sm text-ink"
              title={countries.join(", ")}
            >
              {countries.length ? countries.join(", ") : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-faint">
              Уникальных IP
            </div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums text-ink">
              {ips.length}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">
          Активность
          <span className="ml-2 text-sm font-normal text-ink-faint">
            {events.length}
          </span>
        </h2>
        <EventTable events={events} showUser={false} />
      </div>
    </div>
  );
}
