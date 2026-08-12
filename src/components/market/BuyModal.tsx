"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { CatalogItem, MeResponse, BuyResponse, Order } from "@/lib/types";
import { formatPrice, rarityColor } from "@/lib/types";
import { onImgError } from "@/lib/img";

type View = "loading" | "login" | "tradeurl" | "confirm" | "buying" | "success" | "error";

const TRADE_URL_HELP = "https://steamcommunity.com/tradeoffer/new/";

function isValidTradeUrl(v: string): boolean {
  return (
    v.startsWith("https://steamcommunity.com/tradeoffer/new/?") &&
    /[?&]partner=\d+/.test(v) &&
    /[?&]token=[A-Za-z0-9_-]+/.test(v)
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function BuyModal({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const [view, setView] = useState<View>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tradeUrl, setTradeUrl] = useState("");
  const [tuError, setTuError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  const color = rarityColor(item.rarity);
  const user = me?.user ?? null;
  // The price actually charged tracks any server-side re-quote (priceChanged).
  const price = priceOverride ?? item.priceCents;
  const insufficient = user !== null && user.balanceCents < price;

  // Bumped by retry() to re-run the profile fetch; callers put the modal into
  // the "loading" view first (the initial state already is).
  const [loadNonce, setLoadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: MeResponse) => {
        if (cancelled) return;
        setMe(d);
        if (!d.user) setView("login");
        else if (!d.user.tradeUrl && !d.demo) setView("tradeurl");
        else setView("confirm");
      })
      .catch(() => {
        if (cancelled) return;
        setError("Не удалось загрузить профиль. Проверьте соединение.");
        setView("error");
      });
    return () => {
      cancelled = true;
    };
  }, [loadNonce]);

  // Escape closes — but never while a purchase is in flight.
  const busy = view === "buying";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function saveTradeUrl() {
    const v = tradeUrl.trim();
    if (!isValidTradeUrl(v)) {
      setTuError("Неверный формат. Пример: https://steamcommunity.com/tradeoffer/new/?partner=...&token=...");
      return;
    }
    setSaving(true);
    setTuError(null);
    try {
      const r = await fetch("/api/user/tradeurl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeUrl: v }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (r.ok && d.ok !== false) {
        setMe((m) => (m && m.user ? { ...m, user: { ...m.user, tradeUrl: v } } : m));
        setView("confirm");
      } else {
        setTuError(d.error ?? "Не удалось сохранить Trade URL");
      }
    } catch {
      setTuError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  async function buy() {
    setView("buying");
    setError(null);
    setNotice(null);
    try {
      const r = await fetch("/api/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, expectedPriceCents: price }),
      });
      const d = (await r.json()) as BuyResponse;

      // Price moved server-side: re-quote and ask the user to confirm again.
      if (d.priceChanged && typeof d.currentPriceCents === "number") {
        setPriceOverride(d.currentPriceCents);
        setNotice(`Цена обновилась до ${formatPrice(d.currentPriceCents)}. Подтвердите покупку заново.`);
        setView("confirm");
        return;
      }

      // ok = delivered/created; pending = purchase in flight (balance debited).
      if (d.ok || d.pending) {
        setOrder(d.order ?? null);
        setPending(Boolean(d.pending));
        if (typeof d.newBalanceCents === "number") {
          setMe((m) =>
            m && m.user ? { ...m, user: { ...m.user, balanceCents: d.newBalanceCents as number } } : m,
          );
        }
        setView("success");
        window.dispatchEvent(new Event("bga:balance-changed"));
        return;
      }

      setError(d.error ?? "Не удалось совершить покупку");
      setView("error");
    } catch {
      setError("Ошибка сети. Покупка могла не пройти — проверьте историю заказов в профиле.");
      setView("error");
    }
  }

  function retry() {
    setError(null);
    if (user) {
      setView("confirm");
    } else {
      setView("loading");
      setLoadNonce((n) => n + 1);
    }
  }

  if (typeof document === "undefined") return null;

  const dismiss = () => {
    if (!busy) onClose();
  };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Покупка: ${item.name}`}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismiss} />

      <motion.div
        className="panel relative w-full max-w-md p-6 shadow-[0_24px_90px_-20px_rgba(0,0,0,0.85)]"
        initial={{ opacity: 0, y: 16, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Закрыть"
          onClick={dismiss}
          disabled={busy}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {view === "loading" && (
          <div className="space-y-3 py-2">
            <div className="skeleton h-6 w-2/3" />
            <div className="skeleton h-20" />
            <div className="skeleton h-11" />
          </div>
        )}

        {view === "login" && (
          <div className="flex flex-col items-center py-4 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-panel-2 text-ink-dim">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2a10 10 0 0 0-9.97 9.24l5.35 2.21a2.83 2.83 0 0 1 1.6-.5h.14l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.12a2.83 2.83 0 1 1-5.66 0v-.09l-3.83-1.58A10 10 0 1 0 12 2Zm-5.7 13.5 1.23.51a2.12 2.12 0 1 0 1.1-2.94l1.27.52a1.56 1.56 0 1 1-3.6 1.91Zm9-4.04a2.51 2.51 0 1 1 0-5.02 2.51 2.51 0 0 1 0 5.02Zm0-.63a1.89 1.89 0 1 0 0-3.77 1.89 1.89 0 0 0 0 3.77Z" />
              </svg>
            </div>
            <h3 className="mt-4 font-display text-xl font-bold">Нужен аккаунт Steam</h3>
            <p className="mt-1 text-sm text-ink-dim">
              Войдите через Steam, чтобы покупать предметы и получать их на свой аккаунт.
            </p>
            <a href="/api/auth/steam" className="btn-primary mt-5 w-full">
              Войти через Steam
            </a>
          </div>
        )}

        {view === "tradeurl" && (
          <div>
            <h3 className="pr-8 font-display text-lg font-bold">Укажите Trade URL</h3>
            <p className="mt-1.5 text-sm text-ink-dim">
              Чтобы отправить предмет, нам нужна ваша ссылка на обмен Steam.{" "}
              <a
                href={TRADE_URL_HELP}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent hover:underline"
              >
                Где взять?
              </a>
            </p>
            <input
              className="input mt-4 text-sm"
              placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
              value={tradeUrl}
              onChange={(e) => {
                setTradeUrl(e.target.value);
                setTuError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTradeUrl();
              }}
              spellCheck={false}
              autoFocus
            />
            {tuError && <p className="mt-2 text-sm text-neg">{tuError}</p>}
            <button
              type="button"
              className="btn-primary mt-4 w-full"
              disabled={saving || tradeUrl.trim() === ""}
              onClick={() => void saveTradeUrl()}
            >
              {saving ? (
                <>
                  <Spinner /> Сохраняем…
                </>
              ) : (
                "Сохранить"
              )}
            </button>
          </div>
        )}

        {(view === "confirm" || view === "buying") && user && (
          <div>
            <h3 className="pr-8 font-display text-lg font-bold">Подтверждение покупки</h3>

            <div className="mt-4 flex items-center gap-4 rounded-xl border border-line bg-bg-elevated p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt={item.name}
                loading="lazy"
                onError={onImgError}
                className="h-14 w-20 shrink-0 object-contain"
                style={{ filter: `drop-shadow(0 6px 14px ${color}55)` }}
              />
              <div className="min-w-0">
                <div className="text-xs text-ink-dim">{item.weapon}</div>
                <div className="truncate font-display text-sm font-semibold" title={item.name}>
                  {item.name}
                </div>
              </div>
              <div className="ml-auto shrink-0 font-display text-lg font-bold text-accent">
                {formatPrice(price)}
              </div>
            </div>

            {notice && (
              <p className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
                {notice}
              </p>
            )}

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-dim">Ваш баланс</span>
                <span className={`font-display font-bold ${insufficient ? "text-neg" : "text-pos"}`}>
                  {formatPrice(user.balanceCents)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-dim">К оплате</span>
                <span className="font-display font-bold">{formatPrice(price)}</span>
              </div>
              {!insufficient && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-dim">Останется</span>
                  <span className="font-display font-semibold text-ink-dim">
                    {formatPrice(user.balanceCents - price)}
                  </span>
                </div>
              )}
            </div>

            {insufficient && (
              <p className="mt-3 rounded-lg border border-neg/30 bg-neg/10 px-3 py-2 text-sm text-neg">
                Недостаточно средств на балансе
              </p>
            )}
            {me?.demo && (
              <p className="mt-3 text-xs text-violet">
                Демо-режим: покупка симулируется, баланс и заказы — тестовые.
              </p>
            )}

            <button
              type="button"
              className="btn-primary mt-5 w-full"
              disabled={insufficient || busy}
              onClick={() => void buy()}
            >
              {busy ? (
                <>
                  <Spinner /> Покупаем…
                </>
              ) : (
                "Подтвердить покупку"
              )}
            </button>
          </div>
        )}

        {view === "success" && (
          <div className="flex flex-col items-center py-4 text-center">
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 18 }}
              className="grid h-16 w-16 place-items-center rounded-full bg-pos/15 text-pos"
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
            <h3 className="mt-4 font-display text-xl font-bold">
              {me?.demo
                ? "Куплено (демо-режим)!"
                : pending
                  ? "Покупка обрабатывается"
                  : "Покупка оформлена!"}
            </h3>
            <p className="mt-1 text-sm text-ink-dim">
              {item.name} — {formatPrice(price)}
            </p>
            {!me?.demo && (
              <p className="mt-2 text-xs text-ink-faint">
                {pending
                  ? "Мы создаём трейд-оффер. Он придёт в Steam в течение нескольких минут — статус можно отслеживать в профиле."
                  : "Создаём трейд-оффер — примите его в Steam, чтобы забрать предмет."}
              </p>
            )}
            {order && <p className="mt-1 text-xs text-ink-faint">Заказ #{order.id}</p>}
            <button type="button" className="btn-primary mt-5 w-full" onClick={onClose}>
              Отлично
            </button>
          </div>
        )}

        {view === "error" && (
          <div className="flex flex-col items-center py-4 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-neg/15 text-neg">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="mt-4 font-display text-xl font-bold">Ошибка</h3>
            <p className="mt-1 text-sm text-ink-dim">{error ?? "Что-то пошло не так"}</p>
            <button type="button" className="btn-primary mt-5 w-full" onClick={retry}>
              Повторить
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
