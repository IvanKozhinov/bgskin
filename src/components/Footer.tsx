// Site footer (server component). Documents column is built from the published
// policies. Admin-route exclusion is handled by the layout/header chrome, not
// here — do not add usePathname logic to this file.

import Link from "next/link";
import { footerPolicies } from "@/lib/policies";

export default function Footer() {
  const policies = footerPolicies();

  return (
    <footer className="mt-20 border-t border-line bg-bg-elevated">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-hot font-display text-base font-bold text-black">
                B
              </span>
              <span className="font-display text-lg font-bold tracking-wide">
                BG<span className="text-accent">Skins</span>
                <span className="text-ink-faint">.pro</span>
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-dim">
              Маркет скинов CS2: живые цены, моментальная доставка предметов в Steam через
              трейд-оффер.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-16 gap-y-2 text-sm">
            <div className="flex flex-col gap-2">
              <span className="mb-1 font-display text-xs font-semibold uppercase tracking-widest text-ink-faint">
                Разделы
              </span>
              <Link href="/market" className="text-ink-dim transition-colors hover:text-accent">
                Маркет
              </Link>
              <Link href="/wallet" className="text-ink-dim transition-colors hover:text-accent">
                Кошелёк
              </Link>
              <Link href="/faq" className="text-ink-dim transition-colors hover:text-accent">
                FAQ
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="mb-1 font-display text-xs font-semibold uppercase tracking-widest text-ink-faint">
                Документы
              </span>
              {policies.length === 0 ? (
                <span className="cursor-default text-ink-faint">—</span>
              ) : (
                policies.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/policy/${p.slug}`}
                    className="text-ink-dim transition-colors hover:text-accent"
                  >
                    {p.title}
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} BGSkins.pro — не аффилирован с Valve Corp.</span>
          <span>Counter-Strike 2 является товарным знаком Valve Corporation.</span>
        </div>
      </div>
    </footer>
  );
}
