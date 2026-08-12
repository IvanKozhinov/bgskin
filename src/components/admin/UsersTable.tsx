"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AdminUserRow } from "@/lib/types";
import { formatPrice } from "@/lib/types";

const PAGE_SIZE = 50;

interface Props {
  rows: AdminUserRow[];
  q: string;
  page: number;
}

/** Copy-to-clipboard button, reused on the per-user page. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Скопировать"
      className="inline-flex items-center gap-1 rounded-md border border-line bg-panel-2 px-2 py-1 text-xs text-ink-dim transition-colors hover:border-line-bright hover:text-ink"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {copied ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
      {label ?? (copied ? "Скопировано" : "Копировать")}
    </button>
  );
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/** SQLite UTC "YYYY-MM-DD HH:MM:SS" → localized short date. */
function formatDate(raw: string): string {
  const hasZone = /[TZ+]/.test(raw);
  const d = new Date(hasZone ? raw : `${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function UsersTable({ rows, q, page }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(q);
  const lastPushed = useRef(q);

  // Keep the input in sync when the URL changes externally (back/forward).
  useEffect(() => {
    if (q !== lastPushed.current) {
      lastPushed.current = q;
      setValue(q);
    }
  }, [q]);

  // Debounced push of the search term to the URL (resets to page 1).
  useEffect(() => {
    if (value.trim() === q.trim()) return;
    const t = setTimeout(() => {
      lastPushed.current = value;
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }, 350);
    return () => clearTimeout(t);
  }, [value, q, pathname, router]);

  function pageHref(target: number): string {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const hasPrev = page > 1;
  const hasNext = rows.length === PAGE_SIZE;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
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
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="input pl-9"
            placeholder="Поиск по имени или SteamID64"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Поиск пользователей"
          />
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-faint">
              <th className="px-3 py-2.5 font-semibold">Пользователь</th>
              <th className="px-3 py-2.5 font-semibold">SteamID64</th>
              <th className="px-3 py-2.5 text-right font-semibold">Баланс</th>
              <th className="px-3 py-2.5 font-semibold">Страна</th>
              <th className="px-3 py-2.5 font-semibold">Последний IP</th>
              <th className="px-3 py-2.5 text-right font-semibold">Событий</th>
              <th className="px-3 py-2.5 text-right font-semibold">Заказов</th>
              <th className="px-3 py-2.5 font-semibold">Дата</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-ink-faint">
                  Пользователи не найдены
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr
                  key={u.steamId}
                  onClick={() => router.push(`/admin/users/${u.steamId}`)}
                  className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-panel-2/50"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={u.avatar}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 shrink-0 rounded-full border border-line bg-panel-2 object-cover"
                      />
                      <span className="max-w-[180px] truncate font-medium text-ink">
                        {u.name || "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="font-mono text-xs text-ink-dim"
                      title={u.steamId}
                    >
                      {shortId(u.steamId)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-ink">
                    {formatPrice(u.balanceCents)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {u.lastCountry ? (
                      <span className="font-mono text-xs font-semibold text-ink">
                        {u.lastCountry}
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-dim">
                    {u.lastIp ?? <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-dim">
                    {u.eventCount}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-dim">
                    {u.orderCount}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-dim tabular-nums">
                    {formatDate(u.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-ink-faint">Страница {page}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => router.push(pageHref(page - 1))}
            className="btn-ghost px-3 py-1.5 text-sm disabled:pointer-events-none disabled:opacity-40"
          >
            Назад
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => router.push(pageHref(page + 1))}
            className="btn-ghost px-3 py-1.5 text-sm disabled:pointer-events-none disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      </div>
    </div>
  );
}
