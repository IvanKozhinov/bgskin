"use client";

// Admin editor for the live-feed generator config. Numeric money fields are
// edited in dollars and converted to integer cents on save; the server clamps
// every value, so the response is echoed back into the form as the source of
// truth. "Сбросить к стандартным" loads DEFAULT_FEED_CONFIG into the form
// without persisting until the admin saves.

import { useState, type ReactNode } from "react";
import type { FeedConfig } from "@/lib/types";

interface FormState {
  enabled: boolean;
  maskNicks: boolean;
  minIntervalMs: string;
  maxIntervalMs: string;
  backlogSize: string;
  ringSize: string;
  cheapBias: number; // 0..1
  cheapThresholdDollars: string;
  minPriceDollars: string;
  maxPriceDollars: string;
  nicks: string; // one nickname per line
}

function centsToDollars(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "0";
  const d = cents / 100;
  return Number.isInteger(d) ? String(d) : d.toFixed(2);
}

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(",", ".").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function toInt(v: string): number {
  const n = Number.parseInt(v.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toForm(c: FeedConfig): FormState {
  return {
    enabled: c.enabled,
    maskNicks: c.maskNicks,
    minIntervalMs: String(c.minIntervalMs),
    maxIntervalMs: String(c.maxIntervalMs),
    backlogSize: String(c.backlogSize),
    ringSize: String(c.ringSize),
    cheapBias: c.cheapBias,
    cheapThresholdDollars: centsToDollars(c.cheapThresholdCents),
    minPriceDollars: centsToDollars(c.minPriceCents),
    maxPriceDollars: centsToDollars(c.maxPriceCents),
    nicks: c.nicks.join("\n"),
  };
}

function toPayload(f: FormState): Partial<FeedConfig> {
  return {
    enabled: f.enabled,
    maskNicks: f.maskNicks,
    minIntervalMs: toInt(f.minIntervalMs),
    maxIntervalMs: toInt(f.maxIntervalMs),
    backlogSize: toInt(f.backlogSize),
    ringSize: toInt(f.ringSize),
    cheapBias: f.cheapBias,
    cheapThresholdCents: dollarsToCents(f.cheapThresholdDollars),
    minPriceCents: dollarsToCents(f.minPriceDollars),
    maxPriceCents: dollarsToCents(f.maxPriceDollars),
    nicks: f.nicks
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0),
  };
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked ? "border-accent bg-accent/25" : "border-line bg-panel-2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
            checked ? "left-[22px] bg-accent" : "left-0.5 bg-ink-faint"
          }`}
        />
      </button>
    </div>
  );
}

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
      <label htmlFor={htmlFor} className="block font-display text-sm font-semibold">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function FeedConfigForm({ initial }: { initial: FeedConfig }) {
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function validate(): string | null {
    if (toInt(form.minIntervalMs) > toInt(form.maxIntervalMs)) {
      return "Минимальный интервал не может быть больше максимального.";
    }
    const minP = dollarsToCents(form.minPriceDollars);
    const maxP = dollarsToCents(form.maxPriceDollars);
    if (maxP > 0 && minP > maxP) {
      return "Минимальная цена не может быть больше максимальной.";
    }
    return null;
  }

  async function save(): Promise<void> {
    const problem = validate();
    if (problem) {
      setError(problem);
      setSaved(false);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      if (!res.ok) throw new Error(String(res.status));
      const config = (await res.json()) as FeedConfig;
      setForm(toForm(config));
      setSaved(true);
    } catch {
      setError("Не удалось сохранить настройки. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  async function loadDefaults(): Promise<void> {
    setResetting(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/feed?defaults=1");
      if (!res.ok) throw new Error(String(res.status));
      const config = (await res.json()) as FeedConfig;
      setForm(toForm(config));
    } catch {
      setError("Не удалось загрузить стандартные настройки.");
    } finally {
      setResetting(false);
    }
  }

  const cheapPct = Math.round(form.cheapBias * 100);

  return (
    <div className="mt-6 space-y-5">
      {/* Основное */}
      <section className="panel p-6">
        <h2 className="font-display text-lg font-bold">Основное</h2>
        <div className="mt-4 space-y-5">
          <Toggle
            label="Лента включена"
            hint="Когда выключено, новые события не генерируются."
            checked={form.enabled}
            onChange={(v) => update("enabled", v)}
          />
          <div className="border-t border-line/60" />
          <Toggle
            label="Маскировать никнеймы"
            hint="Скрывает часть символов никнейма покупателя в ленте."
            checked={form.maskNicks}
            onChange={(v) => update("maskNicks", v)}
          />
        </div>
      </section>

      {/* Тайминг и объём */}
      <section className="panel p-6">
        <h2 className="font-display text-lg font-bold">Тайминг и объём</h2>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Мин. интервал"
            hint="Минимальная пауза между событиями, в миллисекундах."
            htmlFor="minIntervalMs"
          >
            <div className="flex items-center gap-2">
              <input
                id="minIntervalMs"
                className="input"
                type="number"
                min={0}
                inputMode="numeric"
                value={form.minIntervalMs}
                onChange={(e) => update("minIntervalMs", e.target.value)}
              />
              <span className="shrink-0 text-sm text-ink-faint">мс</span>
            </div>
          </Field>

          <Field
            label="Макс. интервал"
            hint="Максимальная пауза между событиями, в миллисекундах."
            htmlFor="maxIntervalMs"
          >
            <div className="flex items-center gap-2">
              <input
                id="maxIntervalMs"
                className="input"
                type="number"
                min={0}
                inputMode="numeric"
                value={form.maxIntervalMs}
                onChange={(e) => update("maxIntervalMs", e.target.value)}
              />
              <span className="shrink-0 text-sm text-ink-faint">мс</span>
            </div>
          </Field>

          <Field
            label="Начальная подгрузка"
            hint="Сколько событий показать сразу при загрузке страницы."
            htmlFor="backlogSize"
          >
            <input
              id="backlogSize"
              className="input"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.backlogSize}
              onChange={(e) => update("backlogSize", e.target.value)}
            />
          </Field>

          <Field
            label="Размер буфера"
            hint="Сколько последних событий хранится в памяти."
            htmlFor="ringSize"
          >
            <input
              id="ringSize"
              className="input"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.ringSize}
              onChange={(e) => update("ringSize", e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* Отбор предметов */}
      <section className="panel p-6">
        <h2 className="font-display text-lg font-bold">Отбор предметов</h2>
        <div className="mt-4 space-y-5">
          <Field
            label="Смещение к дешёвым"
            hint="Доля событий, смещённых к более дешёвым предметам."
            htmlFor="cheapBias"
          >
            <div className="flex items-center gap-4">
              <input
                id="cheapBias"
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-panel-2 accent-accent"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={form.cheapBias}
                onChange={(e) => update("cheapBias", Number(e.target.value))}
              />
              <span className="w-12 shrink-0 text-right font-display text-sm font-bold text-accent">
                {cheapPct}%
              </span>
            </div>
          </Field>

          <Field
            label="Порог «дешёвых»"
            hint="Предметы дешевле этой суммы считаются дешёвыми для смещения."
            htmlFor="cheapThreshold"
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-ink-faint">$</span>
              <input
                id="cheapThreshold"
                className="input"
                type="text"
                inputMode="decimal"
                value={form.cheapThresholdDollars}
                onChange={(e) => update("cheapThresholdDollars", e.target.value)}
              />
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Мин. цена"
              hint="Показывать только предметы не дешевле. 0 — без ограничения."
              htmlFor="minPrice"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-ink-faint">$</span>
                <input
                  id="minPrice"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  value={form.minPriceDollars}
                  onChange={(e) => update("minPriceDollars", e.target.value)}
                />
              </div>
            </Field>

            <Field
              label="Макс. цена"
              hint="Показывать только предметы не дороже. 0 — без ограничения."
              htmlFor="maxPrice"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-ink-faint">$</span>
                <input
                  id="maxPrice"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  value={form.maxPriceDollars}
                  onChange={(e) => update("maxPriceDollars", e.target.value)}
                />
              </div>
            </Field>
          </div>
        </div>
      </section>

      {/* Никнеймы */}
      <section className="panel p-6">
        <h2 className="font-display text-lg font-bold">Никнеймы</h2>
        <p className="mt-1 text-xs text-ink-faint">
          Пул никнеймов покупателей — по одному в строке.
        </p>
        <textarea
          id="nicks"
          className="input mt-3 min-h-52 font-mono text-sm leading-relaxed"
          spellCheck={false}
          value={form.nicks}
          onChange={(e) => update("nicks", e.target.value)}
          placeholder={"S1mpleKiller\nb1t_wins\nNiKoGOD"}
        />
      </section>

      {/* Действия */}
      <div className="panel p-6">
        <p className="text-xs text-ink-faint">
          Изменения применяются к ленте в течение нескольких секунд.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={save}
            disabled={saving || resetting}
            className="btn-primary !py-2.5 text-sm"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={loadDefaults}
            disabled={saving || resetting}
            className="btn-ghost !py-2.5 text-sm"
          >
            {resetting ? "Загружаем…" : "Сбросить к стандартным"}
          </button>

          {saved && (
            <p className="flex items-center gap-2 text-sm text-pos" role="status">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2.5 8.5 6 12l7.5-8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Настройки сохранены
            </p>
          )}
          {error && (
            <p className="text-sm text-neg" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
