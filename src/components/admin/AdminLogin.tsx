"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

type Step = "creds" | "totp";

interface LoginResult {
  ok?: boolean;
  totpRequired?: boolean;
  error?: string;
}

export default function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("creds");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const totpRef = useRef<HTMLInputElement>(null);

  function goToAdmin() {
    router.push("/admin");
    router.refresh();
  }

  async function submitCreds(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as LoginResult;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Неверный логин или пароль");
        return;
      }
      if (data.totpRequired) {
        setStep("totp");
        setToken("");
        setTimeout(() => totpRef.current?.focus(), 50);
      } else {
        goToAdmin();
      }
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTotp(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as LoginResult;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Неверный код");
        return;
      }
      goToAdmin();
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-hot font-display text-2xl font-bold text-black shadow-[0_0_28px_rgba(255,140,0,0.5)]">
            B
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-wide">
            BGA<span className="text-accent">Skins</span>
            <span className="text-ink-faint">.cc</span>
          </h1>
          <p className="mt-1 text-sm text-ink-dim">Панель администратора</p>
        </div>

        <div className="panel p-6 sm:p-7">
          {step === "creds" ? (
            <form onSubmit={submitCreds} className="flex flex-col gap-4">
              <div>
                <label htmlFor="admin-username" className="mb-1.5 block text-sm font-medium text-ink-dim">
                  Логин
                </label>
                <input
                  id="admin-username"
                  className="input"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
              <div>
                <label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium text-ink-dim">
                  Пароль
                </label>
                <input
                  id="admin-password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <p className="rounded-lg border border-neg/40 bg-neg/10 px-3 py-2 text-sm text-neg">
                  {error}
                </p>
              )}

              <button type="submit" className="btn-primary mt-1 w-full" disabled={busy}>
                {busy ? "Проверка…" : "Войти"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitTotp} className="flex flex-col gap-4">
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-dim">Код двухфакторной аутентификации</p>
                <p className="mb-3 text-xs text-ink-faint">
                  Введите 6-значный код из приложения-аутентификатора.
                </p>
                <input
                  id="admin-totp"
                  ref={totpRef}
                  className="input text-center font-display text-2xl tracking-[0.5em]"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  required
                />
              </div>

              {error && (
                <p className="rounded-lg border border-neg/40 bg-neg/10 px-3 py-2 text-sm text-neg">
                  {error}
                </p>
              )}

              <button type="submit" className="btn-primary w-full" disabled={busy || token.length !== 6}>
                {busy ? "Проверка…" : "Подтвердить"}
              </button>
              <button
                type="button"
                className="text-center text-sm text-ink-dim transition-colors hover:text-ink"
                onClick={() => {
                  setStep("creds");
                  setError(null);
                  setToken("");
                }}
              >
                Назад
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint">
          Доступ только для персонала BGASkins.cc
        </p>
      </div>
    </div>
  );
}
