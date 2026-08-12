"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MeResponse, SessionUser } from "@/lib/types";
import { formatPrice } from "@/lib/types";

const NAV = [
  { href: "/", label: "Главная" },
  { href: "/market", label: "Маркет" },
  { href: "/profile", label: "Профиль" },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [demo, setDemo] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: MeResponse) => {
        setUser(d.user);
        setDemo(d.demo);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-hot font-display text-lg font-bold text-black shadow-[0_0_18px_rgba(255,140,0,0.45)] transition-transform group-hover:scale-105">
            B
          </span>
          <span className="font-display text-xl font-bold tracking-wide">
            BGA<span className="text-accent">Skins</span>
            <span className="text-ink-faint">.cc</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
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

        <div className="ml-auto flex items-center gap-3">
          {demo && (
            <span
              className="hidden rounded-full border border-violet/40 bg-violet/10 px-2.5 py-1 font-display text-[11px] font-semibold tracking-wider text-violet sm:inline"
              title="Skinsback-ключи не заданы — цены и покупки симулируются"
            >
              DEMO
            </span>
          )}

          {!loaded ? (
            <div className="skeleton h-9 w-36" />
          ) : user ? (
            <div className="relative flex items-center gap-3">
              <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-display text-sm font-bold text-pos">
                {formatPrice(user.balanceCents)}
              </span>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5 transition-colors hover:border-line-bright"
              >
                {user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar}
                    alt=""
                    className="h-6 w-6 rounded-md"
                    loading="lazy"
                  />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-panel-2 text-xs">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-28 truncate text-sm font-medium sm:block">
                  {user.name}
                </span>
                <svg width="10" height="6" viewBox="0 0 10 6" className="text-ink-faint">
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-ink-dim transition-colors hover:bg-panel-2 hover:text-ink"
                  >
                    Профиль и заказы
                  </Link>
                  <button
                    onClick={logout}
                    className="block w-full px-4 py-2.5 text-left text-sm text-neg transition-colors hover:bg-panel-2"
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          ) : (
            <a href="/api/auth/steam" className="btn-primary !px-4 !py-2 text-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2a10 10 0 0 0-9.97 9.24l5.35 2.21a2.83 2.83 0 0 1 1.6-.5h.14l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.12a2.83 2.83 0 1 1-5.66 0v-.09l-3.83-1.58A10 10 0 1 0 12 2Zm-5.7 13.5 1.23.51a2.12 2.12 0 1 0 1.1-2.94l1.27.52a1.56 1.56 0 1 1-3.6 1.91Zm9-4.04a2.51 2.51 0 1 1 0-5.02 2.51 2.51 0 0 1 0 5.02Zm0-.63a1.89 1.89 0 1 0 0-3.77 1.89 1.89 0 0 0 0 3.77Z" />
              </svg>
              Войти через Steam
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
