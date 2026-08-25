"use client";

// Client wallet UI: balance, deposit form with payment-method selection, and
// top-up history. Balance moves only on a verified provider callback — this UI
// never credits optimistically. Configured methods redirect to hosted
// checkout; unconfigured ones record an honest "awaiting provider" intent.

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type {
  Deposit,
  DepositResponse,
  DepositStatus,
  PaymentMethodId,
  PaymentMethodInfo,
  SessionUser,
} from "@/lib/types";
import { formatPrice } from "@/lib/types";

// Limits come from the server (/api/payment-methods); these are only the
// values used before that response arrives.
const FALLBACK_MIN_CENTS = 10_000; // 100 ₽
const FALLBACK_MAX_CENTS = 50_000_000; // 500 000 ₽
const PRESETS_RUB = [500, 1000, 2500, 5000, 10_000, 25_000] as const;

const METHOD_LABELS: Record<PaymentMethodId, string> = {
  sbp: "СБП",
  card: "Банковская карта",
  stripe: "Stripe",
  heleket: "Криптовалюта (Heleket)",
};

const STATUS_META: Record<DepositStatus, { label: string; cls: string }> = {
  created: { label: "Ожидает", cls: "border-line text-ink-dim bg-panel-2" },
  pending: { label: "Ожидает", cls: "border-line text-ink-dim bg-panel-2" },
  paid: { label: "Зачислено", cls: "border-pos/40 text-pos bg-pos/10" },
  failed: { label: "Ошибка", cls: "border-neg/40 text-neg bg-neg/10" },
  canceled: { label: "Отменено", cls: "border-line text-ink-faint bg-panel-2" },
};

function StatusBadge({ status }: { status: DepositStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

/** SQLite datetime('now') has no timezone marker but is UTC — normalize. */
function depositDate(iso: string): string {
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

function methodLabel(id: PaymentMethodId): string {
  return METHOD_LABELS[id] ?? id;
}

const cardMotion = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
});

type FormMsg = { kind: "err" | "info"; text: string };

export default function WalletClient({ user }: { user: SessionUser }) {
  const [balanceCents, setBalanceCents] = useState(user.balanceCents);

  const [methods, setMethods] = useState<PaymentMethodInfo[] | null>(null);
  const [methodsError, setMethodsError] = useState(false);
  const [minCents, setMinCents] = useState(FALLBACK_MIN_CENTS);
  const [maxCents, setMaxCents] = useState(FALLBACK_MAX_CENTS);
  const [selected, setSelected] = useState<PaymentMethodId | null>(null);

  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<FormMsg | null>(null);

  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [depositsError, setDepositsError] = useState(false);

  const amountCents = useMemo(() => {
    const value = Number.parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(value)) return NaN;
    return Math.round(value * 100);
  }, [amount]);

  const amountValid =
    Number.isFinite(amountCents) &&
    amountCents >= minCents &&
    amountCents <= maxCents;

  // Load payment methods.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/payment-methods")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{
          methods: PaymentMethodInfo[];
          minCents?: number;
          maxCents?: number;
        }>;
      })
      .then((d) => {
        if (cancelled) return;
        setMethods(d.methods);
        if (typeof d.minCents === "number") setMinCents(d.minCents);
        if (typeof d.maxCents === "number") setMaxCents(d.maxCents);
        // Preselect the first configured method, else the first available.
        const preferred = d.methods.find((m) => m.configured) ?? d.methods[0];
        if (preferred) setSelected(preferred.id);
      })
      .catch(() => {
        if (!cancelled) {
          setMethodsError(true);
          setMethods([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function loadDeposits() {
    return fetch("/api/deposits")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ deposits: Deposit[] }>;
      })
      .then((d) => {
        setDeposits(d.deposits);
        setDepositsError(false);
      })
      .catch(() => {
        setDepositsError(true);
        setDeposits((prev) => prev ?? []);
      });
  }

  // Load history + refresh balance (e.g. after returning from hosted checkout).
  useEffect(() => {
    void loadDeposits();
    fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<{ user: SessionUser | null }>) : null))
      .then((d) => {
        if (d?.user) setBalanceCents(d.user.balanceCents);
      })
      .catch(() => {
        /* keep prop balance */
      });
  }, []);

  // Surface the Stripe redirect result (?deposit=..&status=success|cancel).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "success") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormMsg({
        kind: "info",
        text: "Оплата получена — баланс обновится после подтверждения провайдером.",
      });
    } else if (status === "cancel") {
      setFormMsg({ kind: "err", text: "Оплата отменена. Вы можете попробовать снова." });
    }
    if (status) {
      const url = new URL(window.location.href);
      url.searchParams.delete("status");
      url.searchParams.delete("deposit");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);

  async function submit() {
    setFormMsg(null);
    if (!selected) {
      setFormMsg({ kind: "err", text: "Выберите способ оплаты" });
      return;
    }
    if (!amountValid) {
      setFormMsg({
        kind: "err",
        text: `Сумма должна быть от ${formatPrice(minCents)} до ${formatPrice(maxCents)}`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, method: selected }),
      });
      const data = (await res.json()) as DepositResponse;

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (!data.ok) {
        setFormMsg({ kind: "err", text: data.error ?? "Не удалось создать пополнение" });
        return;
      }
      if (data.awaitingProvider) {
        setFormMsg({
          kind: "info",
          text: `Заявка на пополнение создана. Оплата картой пока неактивна — мы свяжемся, когда её можно будет провести.`,
        });
      } else {
        setFormMsg({ kind: "info", text: "Заявка на пополнение создана." });
      }
      setAmount("");
      await loadDeposits();
    } catch {
      setFormMsg({ kind: "err", text: "Ошибка сети — попробуйте ещё раз" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Кошелёк</h1>

      {/* Balance */}
      <motion.section {...cardMotion(0)} className="panel mt-6 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-wider text-ink-faint">Текущий баланс</p>
        <p className="mt-2 font-display text-5xl font-bold text-pos sm:text-6xl">
          {formatPrice(balanceCents)}
        </p>
        <p className="mt-2 text-sm text-ink-dim">
          Пополните баланс, чтобы покупать скины. Средства зачисляются после подтверждения оплаты.
        </p>
      </motion.section>

      {/* Deposit form */}
      <motion.section {...cardMotion(0.08)} className="panel mt-5 p-6">
        <h2 className="font-display text-lg font-bold">Пополнить баланс</h2>

        {/* Amount */}
        <label htmlFor="deposit-amount" className="mt-4 block text-sm font-medium text-ink-dim">
          Сумма пополнения
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-lg text-ink-faint">
              $
            </span>
            <input
              id="deposit-amount"
              className="input pl-8 font-display text-lg"
              type="number"
              inputMode="decimal"
              min={minCents / 100}
              max={maxCents / 100}
              step="1"
              placeholder="25"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setFormMsg(null);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS_RUB.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setAmount(String(preset));
                  setFormMsg(null);
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  amount === String(preset)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line bg-bg-elevated text-ink-dim hover:border-line-bright hover:text-ink"
                }`}
              >
                {preset.toLocaleString("ru-RU")} ₽
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Минимум {formatPrice(minCents)}, максимум {formatPrice(maxCents)}.
        </p>

        {/* Payment methods */}
        <p className="mt-6 text-sm font-medium text-ink-dim">Способ оплаты</p>
        {methods === null ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
            <div className="skeleton h-24" />
          </div>
        ) : methods.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-dim">
            {methodsError
              ? "Не удалось загрузить способы оплаты — обновите страницу."
              : "Способы оплаты пока недоступны."}
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {methods.map((m) => {
              const active = selected === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelected(m.id);
                    setFormMsg(null);
                  }}
                  aria-pressed={active}
                  className={`flex flex-col rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? "border-accent bg-accent/5 ring-1 ring-accent/40"
                      : "border-line bg-bg-elevated hover:border-line-bright"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-bold">{m.label}</span>
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        m.configured
                          ? "border-pos/40 text-pos bg-pos/10"
                          : "border-line text-ink-faint bg-panel-2"
                      }`}
                    >
                      {m.configured ? "подключён" : "неактивен"}
                    </span>
                  </div>
                  <span className="mt-1.5 text-sm text-ink-dim">{m.description}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Submit */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            onClick={submit}
            disabled={submitting || !selected || !amountValid || methods?.length === 0}
            className="btn-primary sm:w-auto"
          >
            {submitting
              ? "Обрабатываем…"
              : amountValid
                ? `Пополнить на ${formatPrice(amountCents)}`
                : "Пополнить"}
          </button>
          {selected && methods?.find((m) => m.id === selected)?.configured === false && (
            <span className="text-xs text-ink-faint">
              Способ ещё не подключён — заявка будет сохранена как «Ожидает».
            </span>
          )}
        </div>

        {formMsg && (
          <p
            className={`mt-3 flex items-start gap-2 text-sm ${
              formMsg.kind === "info" ? "text-accent" : "text-neg"
            }`}
            role="status"
          >
            {formMsg.kind === "info" ? (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0" aria-hidden>
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 7.2v3.4M8 5.2h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0" aria-hidden>
                <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
            {formMsg.text}
          </p>
        )}
      </motion.section>

      {/* Deposit history */}
      <motion.section {...cardMotion(0.16)} className="panel mt-5 p-6">
        <h2 className="font-display text-lg font-bold">История пополнений</h2>

        {deposits === null ? (
          <div className="mt-4 space-y-2">
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
            <div className="skeleton h-12" />
          </div>
        ) : deposits.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-6 py-10 text-center text-ink-dim">
            {depositsError
              ? "Не удалось загрузить историю — обновите страницу."
              : "Пополнений пока нет"}
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="pb-3 pr-4 font-medium">Сумма</th>
                    <th className="pb-3 pr-4 font-medium">Способ</th>
                    <th className="pb-3 pr-4 font-medium">Статус</th>
                    <th className="pb-3 font-medium">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <tr key={d.id} className="border-t border-line">
                      <td className="py-3 pr-4 font-display font-bold text-pos">
                        {formatPrice(d.amountCents)}
                      </td>
                      <td className="py-3 pr-4 text-ink-dim">{methodLabel(d.method)}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="py-3 text-ink-dim">{depositDate(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <div className="mt-4 space-y-3 md:hidden">
              {deposits.map((d) => (
                <div key={d.id} className="rounded-xl border border-line bg-bg-elevated p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display font-bold text-pos">{formatPrice(d.amountCents)}</p>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-ink-dim">{methodLabel(d.method)}</span>
                    <span className="text-xs text-ink-faint">{depositDate(d.createdAt)}</span>
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
