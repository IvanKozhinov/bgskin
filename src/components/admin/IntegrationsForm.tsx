"use client";

// Provider credentials. Existing values are never sent back to the browser —
// each field shows only a masked hint and where the value comes from. Typing a
// new value replaces it; submitting an emptied field clears it.

import { useEffect, useState, type ReactNode } from "react";

type Source = "panel" | "env" | "none";

interface SettingStatus {
  name: string;
  set: boolean;
  source: Source;
  hint: string;
  updatedAt: string | null;
}

interface Snapshot {
  settings: SettingStatus[];
  skinsbackLive: boolean;
}

const FIELDS: { name: string; label: string; hint: string; group: string }[] = [
  {
    group: "Skinsback",
    name: "skinsback_shop_id",
    label: "Shop ID",
    hint: "Идентификатор магазина из кабинета Skinsback.",
  },
  {
    group: "Skinsback",
    name: "skinsback_secret",
    label: "Секретный ключ",
    hint: "Client Secret. Используется для подписи запросов и проверки вебхуков.",
  },
  {
    group: "Stripe",
    name: "stripe_secret_key",
    label: "Secret key",
    hint: "sk_live_… — серверный ключ.",
  },
  {
    group: "Stripe",
    name: "stripe_publishable_key",
    label: "Publishable key",
    hint: "pk_live_… — публичный ключ.",
  },
  {
    group: "Stripe",
    name: "stripe_webhook_secret",
    label: "Webhook secret",
    hint: "whsec_… — из настроек вебхука на /api/deposit/webhook/stripe.",
  },
  { group: "Heleket (крипта)", name: "heleket_merchant_id", label: "Merchant ID", hint: "" },
  { group: "Heleket (крипта)", name: "heleket_api_key", label: "API key", hint: "" },
  { group: "СБП / эквайринг", name: "sbp_shop_id", label: "Shop ID", hint: "" },
  { group: "СБП / эквайринг", name: "sbp_secret", label: "Секретный ключ", hint: "" },
];

function SourceBadge({ s }: { s: SettingStatus }) {
  if (s.source === "panel") {
    return (
      <span className="rounded-md border border-pos/40 bg-pos/10 px-2 py-0.5 text-[11px] text-pos">
        задан здесь
      </span>
    );
  }
  if (s.source === "env") {
    return (
      <span className="rounded-md border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-ink-dim">
        из .env
      </span>
    );
  }
  return (
    <span className="rounded-md border border-line bg-panel-2 px-2 py-0.5 text-[11px] text-ink-faint">
      не задан
    </span>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel mt-5 p-6">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export default function IntegrationsForm() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    fetch("/api/admin/integrations")
      .then((r) => r.json())
      .then((d: Snapshot) => setSnap(d))
      .catch(() => setError("Не удалось загрузить настройки."));
  };
  useEffect(load, []);

  const statusOf = (name: string): SettingStatus =>
    snap?.settings.find((s) => s.name === name) ?? {
      name,
      set: false,
      source: "none",
      hint: "",
      updatedAt: null,
    };

  async function save() {
    if (busy) return;
    const dirty = Object.entries(values).filter(([, v]) => v !== undefined);
    if (dirty.length === 0) {
      setError("Нечего сохранять — измените хотя бы одно поле.");
      return;
    }
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(dirty)),
      });
      const data = (await res.json().catch(() => ({}))) as Snapshot & {
        ok?: boolean;
        error?: string;
        verify?: { ok: boolean; message: string };
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Не удалось сохранить.");
        return;
      }
      setSnap({ settings: data.settings, skinsbackLive: data.skinsbackLive });
      setValues({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // Saving Skinsback keys triggers a server-side check — surface it at once,
      // because bad keys leave the storefront with an empty catalogue.
      if (data.verify) setTestResult({ ok: data.verify.ok, text: data.verify.message });
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setBusy(false);
    }
  }

  async function testSkinsback() {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "skinsback" }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      setTestResult({ ok: d.ok === true, text: d.ok ? (d.message ?? "Работает") : (d.error ?? "Ошибка") });
    } catch {
      setTestResult({ ok: false, text: "Не удалось связаться с сервером." });
    } finally {
      setTesting(false);
    }
  }

  if (!snap) {
    return (
      <div className="panel p-6">
        <div className="skeleton h-6 w-52" />
        <div className="skeleton mt-4 h-40 w-full" />
      </div>
    );
  }

  const groups = [...new Set(FIELDS.map((f) => f.group))];

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-wide">Интеграции и ключи</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Ключи хранятся в базе в зашифрованном виде и никогда не показываются повторно — только
          маска. Значения из <code className="text-accent">.env</code> продолжают работать как
          запасной вариант.
        </p>
      </header>

      <section className="panel flex flex-wrap items-center gap-4 p-5">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-ink-faint">Статус Skinsback</p>
          <p
            className={`font-display text-lg font-bold ${snap.skinsbackLive ? "text-pos" : "text-ink-dim"}`}
          >
            {snap.skinsbackLive ? "ключи заданы" : "не подключён"}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost shrink-0"
          onClick={testSkinsback}
          disabled={testing || !snap.skinsbackLive}
        >
          {testing ? "Проверка…" : "Проверить подключение"}
        </button>
      </section>

      {testResult && (
        <p
          className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
            testResult.ok
              ? "border-pos/40 bg-pos/10 text-pos"
              : "border-neg/40 bg-neg/10 text-neg"
          }`}
        >
          {testResult.text}
        </p>
      )}

      {groups.map((group) => (
        <Group key={group} title={group}>
          {FIELDS.filter((f) => f.group === group).map((f) => {
            const s = statusOf(f.name);
            return (
              <div key={f.name}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <label htmlFor={f.name} className="text-sm font-medium text-ink-dim">
                    {f.label}
                  </label>
                  <SourceBadge s={s} />
                  {s.set && <code className="text-xs text-ink-faint">{s.hint}</code>}
                </div>
                <input
                  id={f.name}
                  className="input font-mono text-sm"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={s.set ? "Оставьте пустым, чтобы не менять" : "Не задан"}
                  value={values[f.name] ?? ""}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.name]: e.target.value }));
                    setSaved(false);
                  }}
                />
                {f.hint && <p className="mt-1.5 text-xs text-ink-faint">{f.hint}</p>}
                {values[f.name] === "" && s.source === "panel" && (
                  <p className="mt-1.5 text-xs text-neg">
                    Сохранение с пустым полем удалит ключ (вернётся значение из .env, если оно есть).
                  </p>
                )}
              </div>
            );
          })}
        </Group>
      ))}

      <div className="mt-6 flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          {busy ? "Сохранение…" : "Сохранить ключи"}
        </button>
        {saved && <span className="text-sm text-pos">Сохранено</span>}
        {error && <span className="text-sm text-neg">{error}</span>}
      </div>

      <p className="mt-6 text-xs text-ink-faint">
        Вебхуки: Skinsback → <code className="text-accent">/api/skinsback/callback</code>, Stripe →{" "}
        <code className="text-accent">/api/deposit/webhook/stripe</code>.
      </p>
    </div>
  );
}
