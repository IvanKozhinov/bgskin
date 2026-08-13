"use client";

// Admin pricing: the markup applied on top of the Skinsback cost, with a live
// preview so the effect on real price points is visible before saving.

import { useEffect, useState, type ReactNode } from "react";

interface Tier {
  uptoCents: number;
  percent: number;
}

interface SyncStatus {
  live: boolean;
  offers: number;
  fetchedAt: number;
}

interface FormState {
  markupPercent: string;
  minMarkupCents: string;
  roundToCents: string;
  maxSlippagePercent: string;
  tiers: { upto: string; percent: string }[];
}

const PREVIEW_COSTS = [30, 100, 500, 2500, 10000, 50000]; // cents

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-dim">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

const num = (s: string, fallback = 0): number => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Mirrors src/lib/pricing.ts so the preview matches the server exactly. */
function retail(costCents: number, f: FormState): number {
  if (costCents <= 0) return 0;
  const tiers = f.tiers
    .map((t) => ({ uptoCents: Math.round(num(t.upto) * 100), percent: num(t.percent) }))
    .filter((t) => t.uptoCents > 0 && t.percent >= 0)
    .sort((a, b) => a.uptoCents - b.uptoCents);
  const raw = (cost: number): number => {
    const tier = tiers.find((t) => cost <= t.uptoCents);
    const percent = tier ? tier.percent : num(f.markupPercent);
    const withFloor = Math.max(cost * (1 + percent / 100), cost + num(f.minMarkupCents));
    const step = Math.max(1, Math.round(num(f.roundToCents, 1)));
    const exact = Math.round(withFloor * 1e6) / 1e6; // kill float dust before ceil
    return Math.ceil(exact / step) * step;
  };
  let price = raw(costCents);
  for (const tier of tiers) {
    if (tier.uptoCents < costCents) price = Math.max(price, raw(tier.uptoCents));
  }
  return price;
}

export default function PricingForm() {
  const [form, setForm] = useState<FormState | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/pricing")
      .then((r) => r.json())
      .then(
        (d: {
          markupPercent: number;
          minMarkupCents: number;
          roundToCents: number;
          maxSlippagePercent: number;
          tiers: Tier[];
          sync?: SyncStatus;
        }) => {
          if (cancelled) return;
          setForm({
            markupPercent: String(d.markupPercent),
            minMarkupCents: String(d.minMarkupCents),
            roundToCents: String(d.roundToCents),
            maxSlippagePercent: String(d.maxSlippagePercent),
            tiers: (d.tiers ?? []).map((t) => ({
              upto: String(t.uptoCents / 100),
              percent: String(t.percent),
            })),
          });
          setSync(d.sync ?? null);
        },
      )
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить настройки цен.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaved(false);
  }

  async function save() {
    if (!form || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markupPercent: num(form.markupPercent),
          minMarkupCents: Math.round(num(form.minMarkupCents)),
          roundToCents: Math.round(num(form.roundToCents, 1)),
          maxSlippagePercent: num(form.maxSlippagePercent),
          tiers: form.tiers
            .map((t) => ({
              uptoCents: Math.round(num(t.upto) * 100),
              percent: num(t.percent),
            }))
            .filter((t) => t.uptoCents > 0 && t.percent >= 0),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        config?: { sync?: SyncStatus };
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Не удалось сохранить.");
        return;
      }
      if (data.config?.sync) setSync(data.config.sync);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <div className="panel p-6">
        <div className="skeleton h-6 w-52" />
        <div className="skeleton mt-4 h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-wide">Цены и наценка</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Витрина продаёт по цене Skinsback плюс наценка. Покупателю показывается итоговая цена,
          закупочная не раскрывается.
        </p>
      </header>

      <section className="panel mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-faint">Skinsback</p>
          <p className={`font-display text-lg font-bold ${sync?.live ? "text-pos" : "text-ink-dim"}`}>
            {sync?.live ? "подключён" : "не подключён (демо-цены)"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-faint">Позиций в прайсе</p>
          <p className="font-display text-lg font-bold">{sync?.offers ?? 0}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-faint">Обновлён</p>
          <p className="font-display text-lg font-bold">
            {sync?.fetchedAt ? new Date(sync.fetchedAt).toLocaleTimeString("ru-RU") : "—"}
          </p>
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="font-display text-lg font-bold">Базовые правила</h2>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Наценка по умолчанию"
            hint="Применяется к позициям дороже последней ступени."
            htmlFor="markupPercent"
          >
            <div className="flex items-center gap-2">
              <input
                id="markupPercent"
                className="input"
                type="number"
                min={0}
                step="0.1"
                value={form.markupPercent}
                onChange={(e) => update("markupPercent", e.target.value)}
              />
              <span className="shrink-0 text-sm text-ink-faint">%</span>
            </div>
          </Field>

          <Field
            label="Минимальная наценка"
            hint="Абсолютный минимум прибыли с предмета, в центах."
            htmlFor="minMarkupCents"
          >
            <div className="flex items-center gap-2">
              <input
                id="minMarkupCents"
                className="input"
                type="number"
                min={0}
                value={form.minMarkupCents}
                onChange={(e) => update("minMarkupCents", e.target.value)}
              />
              <span className="shrink-0 text-sm text-ink-faint">¢</span>
            </div>
          </Field>

          <Field
            label="Округление"
            hint="1 — до цента, 10 — до $0.10, 100 — до доллара. Всегда вверх."
            htmlFor="roundToCents"
          >
            <input
              id="roundToCents"
              className="input"
              type="number"
              min={1}
              value={form.roundToCents}
              onChange={(e) => update("roundToCents", e.target.value)}
            />
          </Field>

          <Field
            label="Допустимый рост закупки"
            hint="Насколько цена Skinsback может вырасти между показом и покупкой, прежде чем сделка отменится."
            htmlFor="maxSlippagePercent"
          >
            <div className="flex items-center gap-2">
              <input
                id="maxSlippagePercent"
                className="input"
                type="number"
                min={0}
                step="0.5"
                value={form.maxSlippagePercent}
                onChange={(e) => update("maxSlippagePercent", e.target.value)}
              />
              <span className="shrink-0 text-sm text-ink-faint">%</span>
            </div>
          </Field>
        </div>
      </section>

      <section className="panel mt-5 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">Ступени по цене</h2>
            <p className="mt-1 text-xs text-ink-faint">
              Для дешёвых предметов процент обычно выше. Первая подходящая ступень выигрывает.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost shrink-0 !px-3 !py-2 text-xs"
            onClick={() => update("tiers", [...form.tiers, { upto: "10", percent: "20" }])}
          >
            Добавить
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {form.tiers.length === 0 && (
            <p className="text-sm text-ink-faint">
              Ступеней нет — ко всем позициям применяется наценка по умолчанию.
            </p>
          )}
          {form.tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-ink-dim">до $</span>
              <input
                className="input sm:max-w-32"
                type="number"
                min={0}
                step="0.01"
                value={t.upto}
                onChange={(e) => {
                  const tiers = [...form.tiers];
                  tiers[i] = { ...tiers[i], upto: e.target.value };
                  update("tiers", tiers);
                }}
              />
              <span className="shrink-0 text-sm text-ink-dim">→</span>
              <input
                className="input sm:max-w-28"
                type="number"
                min={0}
                step="0.1"
                value={t.percent}
                onChange={(e) => {
                  const tiers = [...form.tiers];
                  tiers[i] = { ...tiers[i], percent: e.target.value };
                  update("tiers", tiers);
                }}
              />
              <span className="shrink-0 text-sm text-ink-faint">%</span>
              <button
                type="button"
                className="ml-auto shrink-0 text-sm text-neg transition-opacity hover:opacity-80"
                onClick={() => update("tiers", form.tiers.filter((_, j) => j !== i))}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel mt-5 p-6">
        <h2 className="font-display text-lg font-bold">Предпросмотр</h2>
        <p className="mt-1 text-xs text-ink-faint">Как пересчитаются типовые цены.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-faint">
                <th className="pb-2">Закупка</th>
                <th className="pb-2">Цена на витрине</th>
                <th className="pb-2">Прибыль</th>
                <th className="pb-2">Наценка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {PREVIEW_COSTS.map((cost) => {
                const price = retail(cost, form);
                const profit = price - cost;
                return (
                  <tr key={cost}>
                    <td className="py-2 text-ink-dim">{money(cost)}</td>
                    <td className="py-2 font-display font-bold text-accent">{money(price)}</td>
                    <td className="py-2 text-pos">+{money(profit)}</td>
                    <td className="py-2 text-ink-dim">
                      {cost > 0 ? `${((profit / cost) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? "Сохранение…" : "Сохранить"}
        </button>
        {saved && <span className="text-sm text-pos">Сохранено</span>}
        {error && <span className="text-sm text-neg">{error}</span>}
      </div>
    </div>
  );
}
