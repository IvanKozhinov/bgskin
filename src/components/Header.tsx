"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MeResponse, SessionUser } from "@/lib/types";
import { formatPrice } from "@/lib/types";

const NAV = [
  { href: "/", label: "Главная" },
  { href: "/market", label: "Маркет" },
  { href: "/wallet", label: "Кошелёк" },
  { href: "/faq", label: "FAQ" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function SteamIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2a10 10 0 0 0-9.97 9.24l5.35 2.21a2.83 2.83 0 0 1 1.6-.5h.14l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.12a2.83 2.83 0 1 1-5.66 0v-.09l-3.83-1.58A10 10 0 1 0 12 2Zm-5.7 13.5 1.23.51a2.12 2.12 0 1 0 1.1-2.94l1.27.52a1.56 1.56 0 1 1-3.6 1.91Zm9-4.04a2.51 2.51 0 1 1 0-5.02 2.51 2.51 0 0 1 0 5.02Zm0-.63a1.89 1.89 0 1 0 0-3.77 1.89 1.89 0 0 0 0 3.77Z" />
    </svg>
  );
}

export default function Header() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Load the session user, and keep the balance pill in sync after purchases /
  // deposits (they dispatch "bga:balance-changed") and on every route change.
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      fetch("/api/me")
        .then((r) => r.json())
        .then((d: MeResponse) => {
          if (cancelled) return;
          setUser(d.user);
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoaded(true);
        });
    refresh();
    const onBalance = () => void refresh();
    window.addEventListener("bga:balance-changed", onBalance);
    return () => {
      cancelled = true;
      window.removeEventListener("bga:balance-changed", onBalance);
    };
  }, [pathname]);

  // Collapse any open menu when the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  // Close menus on outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !mobileOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.("[data-account-menu]")) setMenuOpen(false);
      if (!t?.closest?.("[data-mobile-menu]")) setMobileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, mobileOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setMenuOpen(false);
    setMobileOpen(false);
    router.push("/");
    router.refresh();
  }

  // Storefront chrome must not render on the admin surface.
  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5">
          <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-hot font-display text-lg font-bold text-black shadow-[0_0_18px_rgba(255,140,0,0.45)] transition-transform group-hover:scale-105">
            B
          </span>
          <span className="font-display text-xl font-bold tracking-wide">
            BG<span className="text-accent">Skins</span>
            <span className="text-ink-faint">.pro</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3.5 py-2 font-display text-sm font-semibold tracking-wide transition-colors ${
                  active ? "bg-panel-2 text-accent" : "text-ink-dim hover:bg-panel hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          {loaded && user && (
            <span className="shrink-0 whitespace-nowrap rounded-lg border border-line bg-panel px-2.5 py-1.5 font-display text-sm font-bold text-pos sm:px-3">
              {formatPrice(user.balanceCents)}
            </span>
          )}

          {!loaded ? (
            <div className="skeleton h-9 w-28 shrink-0" />
          ) : user ? (
            // Desktop account dropdown.
            <div className="relative hidden shrink-0 md:block" data-account-menu>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5 transition-colors hover:border-line-bright"
              >
                {user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar} alt="" className="h-6 w-6 rounded-md" loading="lazy" />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-panel-2 text-xs">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="max-w-28 truncate text-sm font-medium">{user.name}</span>
                <svg width="10" height="6" viewBox="0 0 10 6" className="text-ink-faint">
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
                >
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink"
                  >
                    Профиль
                  </Link>
                  <Link
                    href="/wallet"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink"
                  >
                    Кошелёк
                  </Link>
                  <button
                    onClick={logout}
                    className="block w-full border-t border-line px-4 py-2.5 text-left text-sm text-neg transition-colors hover:bg-panel-2"
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          ) : (
            <a href="/api/auth/steam" className="btn-primary hidden shrink-0 !px-4 !py-2 text-sm md:inline-flex">
              <SteamIcon />
              Войти через Steam
            </a>
          )}

          {/* Mobile menu — same links + auth actions. */}
          <div className="relative shrink-0 md:hidden" data-mobile-menu>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Меню"
              aria-haspopup="menu"
              aria-expanded={mobileOpen}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel transition-colors hover:border-line-bright"
            >
              {mobileOpen ? (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden>
                  <path d="M1 1h16M1 7h16M1 13h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </button>

            {mobileOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
              >
                {loaded && user && (
                  <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                    {user.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatar} alt="" className="h-8 w-8 rounded-md" loading="lazy" />
                    ) : (
                      <span className="grid h-8 w-8 place-items-center rounded-md bg-panel-2 text-sm">
                        {user.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.name}</span>
                  </div>
                )}

                <nav className="py-1">
                  {NAV.map((n) => {
                    const active = isActive(pathname, n.href);
                    return (
                      <Link
                        key={n.href}
                        href={n.href}
                        onClick={() => setMobileOpen(false)}
                        className={`block px-4 py-2.5 font-display text-sm font-semibold tracking-wide transition-colors ${
                          active ? "text-accent" : "text-ink-dim hover:bg-panel-2 hover:text-ink"
                        }`}
                      >
                        {n.label}
                      </Link>
                    );
                  })}
                </nav>

                {loaded &&
                  (user ? (
                    <div className="border-t border-line py-1">
                      <Link
                        href="/profile"
                        onClick={() => setMobileOpen(false)}
                        className="block px-4 py-2.5 text-sm text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink"
                      >
                        Профиль
                      </Link>
                      <button
                        onClick={logout}
                        className="block w-full px-4 py-2.5 text-left text-sm text-neg transition-colors hover:bg-panel-2"
                      >
                        Выйти
                      </button>
                    </div>
                  ) : (
                    <div className="border-t border-line p-3">
                      <a
                        href="/api/auth/steam"
                        className="btn-primary w-full !py-2 text-sm"
                        onClick={() => setMobileOpen(false)}
                      >
                        <SteamIcon />
                        Войти через Steam
                      </a>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
