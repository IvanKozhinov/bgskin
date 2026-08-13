"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  {
    href: "/admin",
    label: "Дашборд",
    exact: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "Пользователи",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20c0-3 2.7-4.6 6-4.6s6 1.6 6 4.6" />
        <path d="M16 4.2a3.2 3.2 0 0 1 0 6.2" />
        <path d="M18 15.6c2.2.5 3.5 1.9 3.5 4.4" />
      </svg>
    ),
  },
  {
    href: "/admin/policies",
    label: "Политики",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    href: "/admin/integrations",
    label: "Интеграции",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
        <path d="M9 17H7A5 5 0 0 1 7 7h2" />
        <path d="M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/admin/pricing",
    label: "Цены",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v18" />
        <path d="M16.5 7.5c-.6-1.6-2.2-2.5-4.5-2.5-2.5 0-4 1.2-4 3s1.4 2.6 4 3.2c2.8.6 4.5 1.4 4.5 3.4 0 2-1.7 3.4-4.5 3.4-2.5 0-4.2-1-4.8-2.8" />
      </svg>
    ),
  },
  {
    href: "/admin/feed",
    label: "Лайв-лента",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 11a9 9 0 0 1 9 9" />
        <path d="M4 5a15 15 0 0 1 15 15" />
        <circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "/admin/2fa",
    label: "2FA",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3l7 3v5c0 4.6-3 8.2-7 9.6C8 21.2 5 17.6 5 13V6l7-3Z" />
        <path d="M9.2 12.2l2 2 3.6-3.8" />
      </svg>
    ),
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // ignore — cookie may already be gone; still route to login
    }
    router.push("/admin/login");
    router.refresh();
  }

  const navLinks = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 font-display text-sm font-semibold tracking-wide transition-colors ${
              active
                ? "bg-panel-2 text-accent shadow-[inset_2px_0_0_0_var(--accent)]"
                : "text-ink-dim hover:bg-panel hover:text-ink"
            }`}
          >
            <span className={active ? "text-accent" : "text-ink-faint"}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-full bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-ink-dim transition-colors hover:border-line-bright hover:text-ink md:hidden"
            aria-label="Меню"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {mobileOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>

          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-hot font-display text-base font-bold text-black shadow-[0_0_16px_rgba(255,140,0,0.4)]">
              B
            </span>
            <span className="font-display text-lg font-bold tracking-wide">
              BGA<span className="text-accent">Skins</span>
              <span className="ml-2 rounded-md border border-violet/40 bg-violet/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet">
                Admin
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/"
              className="hidden font-display text-sm font-semibold text-ink-dim transition-colors hover:text-ink sm:inline"
            >
              На сайт
            </Link>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="btn-ghost !px-3.5 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
                <path d="M10 17l-5-5 5-5" />
                <path d="M5 12h11" />
              </svg>
              Выйти
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-line bg-bg-elevated/60 p-4 md:block">
          {navLinks}
          <div className="mt-6 border-t border-line pt-4">
            <p className="px-3.5 text-[11px] uppercase tracking-wider text-ink-faint">
              BGASkins.cc
            </p>
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 top-14 z-30 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <aside className="fixed left-0 top-14 z-40 h-[calc(100vh-3.5rem)] w-64 border-r border-line bg-bg-elevated p-4 md:hidden">
              {navLinks}
            </aside>
          </>
        )}

        {/* Content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
