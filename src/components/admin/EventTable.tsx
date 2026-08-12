// Audit-event table shared by the admin dashboard and the per-user view.
// Pure presentational server component — no client JS needed.

import Link from "next/link";
import type { UserEvent } from "@/lib/types";

interface Props {
  events: UserEvent[];
  /** Render the "user" column (steamId). Off on the per-user page. */
  showUser?: boolean;
}

const TYPE_META: Record<string, { label: string; cls: string }> = {
  login: { label: "вход", cls: "border-pos/30 bg-pos/10 text-pos" },
  logout: { label: "выход", cls: "border-line bg-panel-2 text-ink-dim" },
  buy: { label: "покупка", cls: "border-accent/30 bg-accent/10 text-accent" },
  deposit: { label: "депозит", cls: "border-violet/40 bg-violet/10 text-violet" },
  tradeurl: {
    label: "трейд-ссылка",
    cls: "border-accent-hot/30 bg-accent-hot/10 text-accent-hot",
  },
  pageview: { label: "просмотр", cls: "border-line bg-panel-2 text-ink-faint" },
};

/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS" (no zone). Treat it as UTC. */
function formatTime(raw: string): string {
  const hasZone = /[TZ+]/.test(raw);
  const iso = hasZone ? raw : `${raw.replace(" ", "T")}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortId(id: string): string {
  return id.length > 10 ? `…${id.slice(-8)}` : id;
}

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_META[type];
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${
        meta?.cls ?? "border-line bg-panel-2 text-ink-dim"
      }`}
      title={type}
    >
      {meta?.label ?? type}
    </span>
  );
}

export default function EventTable({ events, showUser = false }: Props) {
  if (events.length === 0) {
    return (
      <div className="panel px-4 py-12 text-center text-ink-faint">Событий нет</div>
    );
  }

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-faint">
            <th className="px-3 py-2.5 font-semibold">Время</th>
            <th className="px-3 py-2.5 font-semibold">Тип</th>
            {showUser && <th className="px-3 py-2.5 font-semibold">Пользователь</th>}
            <th className="px-3 py-2.5 font-semibold">IP</th>
            <th className="px-3 py-2.5 font-semibold">Страна</th>
            <th className="px-3 py-2.5 font-semibold">Путь</th>
            <th className="px-3 py-2.5 font-semibold">Meta</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const metaJson = e.meta ? JSON.stringify(e.meta) : null;
            return (
              <tr
                key={e.id}
                className="border-b border-line/60 last:border-0 hover:bg-panel-2/50"
              >
                <td className="whitespace-nowrap px-3 py-2 text-ink-dim tabular-nums">
                  {formatTime(e.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <TypeBadge type={e.type} />
                </td>
                {showUser && (
                  <td className="px-3 py-2">
                    {e.steamId ? (
                      <Link
                        href={`/admin/users/${e.steamId}`}
                        title={e.steamId}
                        className="font-mono text-xs text-ink-dim underline-offset-2 hover:text-accent hover:underline"
                      >
                        {shortId(e.steamId)}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">гость</span>
                    )}
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-dim">
                  {e.ip ?? <span className="text-ink-faint">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {e.country ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="font-mono text-xs font-semibold text-ink">
                        {e.country}
                      </span>
                      {e.countryName && (
                        <span className="text-xs text-ink-faint">{e.countryName}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {e.path ? (
                    <span
                      className="block max-w-[220px] truncate font-mono text-xs text-ink-dim"
                      title={e.path}
                    >
                      {e.path}
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {metaJson ? (
                    <span
                      className="block max-w-[200px] truncate font-mono text-[11px] text-ink-faint"
                      title={metaJson}
                    >
                      {metaJson}
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
