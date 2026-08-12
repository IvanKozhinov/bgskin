"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

interface SetupData {
  qr: string;
  secret: string;
}

type ApiResult = { ok?: boolean; error?: string };

export default function TwoFactorSetup() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const tokenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/2fa/status")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => {
        if (cancelled) return;
        setEnabled(d.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить статус 2FA.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function resetForms() {
    setToken("");
    setError(null);
  }

  async function beginSetup() {
    if (busy) return;
    setBusy(true);
    resetForms();
    setNotice(null);
    try {
      const res = await fetch("/api/admin/2fa/setup");
      const data = (await res.json().catch(() => ({}))) as SetupData & ApiResult;
      if (!res.ok || !data.qr || !data.secret) {
        setError(data.error ?? "Не удалось сгенерировать секрет.");
        return;
      }
      setSetup({ qr: data.qr, secret: data.secret });
      setTimeout(() => tokenRef.current?.focus(), 50);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function enable(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiResult;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Неверный код");
        return;
      }
      setEnabled(true);
      setSetup(null);
      setToken("");
      setNotice("Двухфакторная аутентификация включена.");
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiResult;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Неверный код");
        return;
      }
      setEnabled(false);
      setSetup(null);
      setToken("");
      setNotice("Двухфакторная аутентификация отключена.");
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — the secret is visible for manual copy anyway
    }
  }

  const onTokenChange = (v: string) => setToken(v.replace(/\D/g, "").slice(0, 6));

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-wide">Двухфакторная аутентификация</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Защитите вход в админку одноразовыми кодами из приложения-аутентификатора.
        </p>
      </header>

      {notice && (
        <p className="mb-5 rounded-lg border border-pos/40 bg-pos/10 px-4 py-3 text-sm text-pos">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="panel p-6">
          <div className="skeleton h-6 w-40" />
          <div className="skeleton mt-4 h-24 w-full" />
        </div>
      ) : enabled ? (
        <div className="panel p-6 sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-pos/40 bg-pos/10 text-pos">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <div>
              <p className="font-display text-lg font-bold text-pos">2FA включена</p>
              <p className="text-sm text-ink-dim">Вход требует одноразовый код.</p>
            </div>
          </div>

          <form onSubmit={disable} className="border-t border-line pt-5">
            <p className="mb-2 text-sm font-medium text-ink-dim">Отключить 2FA</p>
            <p className="mb-3 text-xs text-ink-faint">
              Введите текущий код из приложения, чтобы подтвердить отключение.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="input text-center font-display text-xl tracking-[0.4em] sm:max-w-48"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={token}
                onChange={(e) => onTokenChange(e.target.value)}
                placeholder="000000"
              />
              <button
                type="submit"
                className="btn-ghost !border-neg/40 !text-neg hover:!border-neg disabled:opacity-60"
                disabled={busy || token.length !== 6}
              >
                {busy ? "Отключение…" : "Отключить 2FA"}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-neg">{error}</p>}
          </form>
        </div>
      ) : setup ? (
        <div className="panel p-6 sm:p-7">
          <p className="mb-4 text-sm text-ink-dim">
            Отсканируйте QR-код в приложении (Google Authenticator, Authy и т. п.), затем введите
            сгенерированный 6-значный код для подтверждения.
          </p>

          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <div className="rounded-xl border border-line bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR-код для настройки 2FA" width={200} height={200} className="h-[200px] w-[200px]" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-ink-faint">Ручной ввод ключа</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-bg-elevated px-3 py-2 font-mono text-sm text-accent">
                  {setup.secret}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  className="btn-ghost shrink-0 !px-3 !py-2 text-xs"
                >
                  {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>

              <form onSubmit={enable} className="mt-5">
                <label htmlFor="enable-token" className="mb-1.5 block text-sm font-medium text-ink-dim">
                  Код подтверждения
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="enable-token"
                    ref={tokenRef}
                    className="input text-center font-display text-xl tracking-[0.4em] sm:max-w-48"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={token}
                    onChange={(e) => onTokenChange(e.target.value)}
                    placeholder="000000"
                  />
                  <button type="submit" className="btn-primary" disabled={busy || token.length !== 6}>
                    {busy ? "Проверка…" : "Включить"}
                  </button>
                </div>
                {error && <p className="mt-3 text-sm text-neg">{error}</p>}
              </form>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel p-6 sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel-2 text-ink-faint">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0" />
              </svg>
            </span>
            <div>
              <p className="font-display text-lg font-bold">2FA выключена</p>
              <p className="text-sm text-ink-dim">Рекомендуем включить для защиты аккаунта.</p>
            </div>
          </div>

          {error && <p className="mb-4 text-sm text-neg">{error}</p>}

          <button type="button" className="btn-primary" onClick={beginSetup} disabled={busy}>
            {busy ? "Подготовка…" : "Включить 2FA"}
          </button>
        </div>
      )}
    </div>
  );
}
