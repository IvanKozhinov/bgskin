"use client";

// Client profile UI: identity + balance card, trade URL form, order history.

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import type {
  Deposit,
  DepositStatus,
  Order,
  OrderStatus,
  PaymentMethodId,
  SessionUser,
} from "@/lib/types";
import { formatPrice } from "@/lib/types";

const TRADE_URL_RE =
  /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[A-Za-z0-9_-]{5,}$/;

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: "Ожидает", cls: "border-line text-ink-dim bg-panel-2" },
  processing: { label: "Покупаем", cls: "border-accent/40 text-accent bg-accent/10" },
  sent: { label: "Трейд отправлен", cls: "border-accent/40 text-accent bg-accent/10" },
  delivered: { label: "Доставлен", cls: "border-pos/40 text-pos bg-pos/10" },
  failed: {
    label: "Ошибка (средства возвращены)",
    cls: "border-neg/40 text-neg bg-neg/10",
  },
  demo_delivered: { label: "Доставлен", cls: "border-pos/40 text-pos bg-pos/10" },
};

/**
 * Direct link to the Steam trade offer. Skinsback creates the offer on its side;
 * without this the buyer has to dig through their Steam notifications to find it.
 */
function TradeOfferLink({ id }: { id: string }) {
  return (
    <a
      href={`https://steamcommunity.com/tradeoffer/${id}/`}
      target="_blank"
      rel="noopener noreferrer"
      className="whitespace-nowrap text-xs font-medium text-accent underline-offset-2 hover:underline"
    >
      Принять трейд →
    </a>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

const DEPOSIT_STATUS_META: Record<DepositStatus, { label: string; cls: string }> = {
  created: { label: "Ожидает", cls: "border-line text-ink-dim bg-panel-2" },
  pending: { label: "Ожидает", cls: "border-line text-ink-dim bg-panel-2" },
  paid: { label: "Зачислено", cls: "border-pos/40 text-pos bg-pos/10" },
  failed: { label: "Ошибка", cls: "border-neg/40 text-neg bg-neg/10" },
  canceled: { label: "Отменено", cls: "border-line text-ink-faint bg-panel-2" },
};

const DEPOSIT_METHOD_LABELS: Record<PaymentMethodId, string> = {
  sbp: "СБП",
  card: "Банковская карта",
  stripe: "Stripe",
  heleket: "Криптовалюта (Heleket)",
};

function DepositStatusBadge({ status }: { status: DepositStatus }) {
  const meta = DEPOSIT_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

/** SQLite datetime('now') has no timezone marker but is UTC — normalize. */
function orderDate(iso: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)
    ? `${iso.replace(" ", "T")}Z`
    : iso;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const cardMotion = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
});

export default function ProfileClient({ user }: { user: SessionUser }) {
  const [copied, setCopied] = useState(false);

  const [tradeUrl, setTradeUrl] = useState(user.tradeUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [ordersError, setOrdersError] = useState(false);

  const [deposits, setDeposits] = useState<Deposit[] | null>(null);

  // Orders move through "покупаем" → "трейд отправлен" → "доставлен" on the
  // provider's clock, so a static page would leave the buyer staring at a stale
  // status. Poll while anything is still in flight, then stop.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = () => {
      fetch("/api/orders")
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<{ orders: Order[] }>;
        })
        .then((d) => {
          if (cancelled) return;
          setOrders(d.orders);
          const pending = d.orders.some(
            (o) => o.status === "pending" || o.status === "processing" || o.status === "sent",
          );
          if (pending) timer = setTimeout(load, 12_000);
        })
        .catch(() => {
          if (!cancelled) {
            setOrdersError(true);
            setOrders([]);
          }
        });
    };

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deposits")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ deposits: Deposit[] }>;
      })
      .then((d) => {
        if (!cancelled) setDeposits(d.deposits);
      })
      .catch(() => {
        if (!cancelled) setDeposits([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copySteamId() {
    try {
      await navigator.clipboard.writeText(user.steamId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  async function saveTradeUrl() {
    const value = tradeUrl.trim();
    setSaveMsg(null);
    if (!TRADE_URL_RE.test(value)) {
      setSaveMsg({
        kind: "err",
        text: "Похоже, ссылка неверного формата — сверьтесь с подсказкой ниже.",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/user/tradeurl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeUrl: value }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setSaveMsg({ kind: "ok", text: "Трейд-ссылка сохранена" });
      } else {
        setSaveMsg({ kind: "err", text: data.error ?? "Не удалось сохранить ссылку" });
      }
    } catch {
      setSaveMsg({ kind: "err", text: "Ошибка сети — попробуйте ещё раз" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Профиль</h1>

      {/* Identity + balance */}
      <motion.section {...cardMotion(0)} className="panel mt-6 p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-5">
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar}
                alt={user.name}
                loading="lazy"
                className="h-20 w-20 shrink-0 rounded-xl ring-2 ring-accent"
              />
            ) : (
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-panel-2 font-display text-3xl font-bold text-accent ring-2 ring-accent">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-2xl font-bold">{user.name}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-sm text-ink-dim">{user.steamId}</span>
                <button
                  onClick={copySteamId}
                  title="Скопировать SteamID64"
                  aria-label="Скопировать SteamID64"
                  className="grid h-7 w-7 place-items-center rounded-md border border-line bg-bg-elevated text-ink-dim transition-colors hover:border-line-bright hover:text-ink"
                >
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-pos" aria-hidden>
                      <path
                        d="M2.5 8.5 6 12l7.5-8"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                      <path
                        d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"
                        stroke="currentColor"
                        strokeWidth="1.4"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-pos/25 bg-pos/5 px-5 py-4 text-center">
            <p className="text-xs uppercase tracking-wider text-ink-faint">Баланс</p>
            <p className="mt-1 font-display text-3xl font-bold text-pos">
              {formatPrice(user.balanceCents)}
            </p>
            <Link href="/wallet" className="btn-primary mt-3 w-full !py-2 text-sm">
              Пополнить баланс
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Recent deposits */}
      <motion.section {...cardMotion(0.08)} className="panel mt-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Последние пополнения</h2>
          <Link
            href="/wallet"
            className="text-sm font-medium text-accent transition-colors hover:text-accent-hot"
          >
            Пополнить →
          </Link>
        </div>

        {deposits === null ? (
          <div className="mt-4 space-y-2">
            <div className="skeleton h-11" />
            <div className="skeleton h-11" />
          </div>
        ) : deposits.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-6 py-8 text-center text-ink-dim">
            Пополнений пока нет
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {deposits.slice(0, 5).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-display font-bold text-pos">
                    {formatPrice(d.amountCents)}
                  </span>
                  <span className="truncate text-sm text-ink-dim">
                    {DEPOSIT_METHOD_LABELS[d.method] ?? d.method}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <DepositStatusBadge status={d.status} />
                  <span className="text-xs text-ink-faint">{orderDate(d.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </motion.section>

      {/* Trade URL */}
      <motion.section {...cardMotion(0.16)} className="panel mt-5 p-6">
        <h2 className="font-display text-lg font-bold">Трейд-ссылка</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Нужна, чтобы бот мог отправить вам предложение обмена с купленным предметом.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="input font-mono text-sm"
            type="url"
            placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"
            value={tradeUrl}
            onChange={(e) => {
              setTradeUrl(e.target.value);
              setSaveMsg(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving && tradeUrl.trim().length > 0) {
                void saveTradeUrl();
              }
            }}
            spellCheck={false}
          />
          <button
            onClick={saveTradeUrl}
            disabled={saving || tradeUrl.trim().length === 0}
            className="btn-primary shrink-0 !py-2.5 text-sm"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
        {saveMsg && (
          <p
            className={`mt-3 flex items-center gap-2 text-sm ${
              saveMsg.kind === "ok" ? "text-pos" : "text-neg"
            }`}
            role="status"
          >
            {saveMsg.kind === "ok" ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2.5 8.5 6 12l7.5-8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M3 3l10 10M13 3 3 13"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {saveMsg.text}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-faint">
          Формат: https://steamcommunity.com/tradeoffer/new/?partner=…&amp;token=…{" "}
          <a
            href="https://steamcommunity.com/id/me/tradeoffers/privacy#trade_offer_access_url"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent transition-colors hover:text-accent-hot"
          >
            Найти свой Trade URL →
          </a>
        </p>
      </motion.section>

      {/* Orders */}
      <motion.section {...cardMotion(0.24)} className="panel mt-5 p-6">
        <h2 className="font-display text-lg font-bold">История покупок</h2>

        {orders === null ? (
          <div className="mt-4 space-y-2">
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-10 text-center">
            <p className="text-ink-dim">
              {ordersError ? "Не удалось загрузить заказы — обновите страницу." : "Пока нет покупок"}
            </p>
            {!ordersError && (
              <Link href="/market" className="text-sm font-medium text-accent transition-colors hover:text-accent-hot">
                Перейти в маркет →
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="pb-3 pr-4 font-medium">Предмет</th>
                    <th className="pb-3 pr-4 font-medium">Цена</th>
                    <th className="pb-3 pr-4 font-medium">Дата</th>
                    <th className="pb-3 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t border-line">
                      <td className="max-w-64 truncate py-3 pr-4 font-medium">{o.itemName}</td>
                      <td className="py-3 pr-4 font-display font-bold text-accent">
                        {formatPrice(o.priceCents)}
                      </td>
                      <td className="py-3 pr-4 text-ink-dim">{orderDate(o.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={o.status} />
                    {o.tradeOfferId && o.status === "sent" && <TradeOfferLink id={o.tradeOfferId} />}
                          {o.tradeOfferId && o.status === "sent" && (
                            <TradeOfferLink id={o.tradeOfferId} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <div className="mt-4 space-y-3 md:hidden">
              {orders.map((o) => (
                <div key={o.id} className="rounded-xl border border-line bg-bg-elevated p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">{o.itemName}</p>
                    <p className="shrink-0 font-display font-bold text-accent">
                      {formatPrice(o.priceCents)}
                    </p>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-ink-dim">{orderDate(o.createdAt)}</span>
                    <StatusBadge status={o.status} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </motion.section>
    </div>
  );
}
