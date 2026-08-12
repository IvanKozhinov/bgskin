// Public FAQ / rules page. Renders every FAQ-flagged published policy as a
// native <details> accordion, styled to match the landing FAQ.

import type { Metadata } from "next";
import Link from "next/link";
import { faqPolicies } from "@/lib/policies";
import { renderMarkdown } from "@/lib/md";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FAQ — BGASkins.cc",
  description: "Правила сервиса и ответы на частые вопросы о покупке скинов CS2 на BGASkins.cc.",
};

// Tailwind descendant styling for the injected Markdown HTML.
const PROSE =
  "text-sm text-ink-dim leading-relaxed " +
  "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink " +
  "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:font-display [&_h3]:font-semibold [&_h3]:text-ink " +
  "[&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:font-display [&_h4]:font-semibold [&_h4]:text-ink " +
  "[&_h5]:mt-3 [&_h5]:mb-1 [&_h5]:font-semibold [&_h5]:text-ink " +
  "[&_p]:my-2.5 " +
  "[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 " +
  "[&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 " +
  "[&_li]:marker:text-accent " +
  "[&_strong]:font-semibold [&_strong]:text-ink " +
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-accent-hot " +
  "[&_code]:rounded [&_code]:bg-bg-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-accent";

export default function FaqPage() {
  const policies = faqPolicies();

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="text-center">
        <p className="font-display text-sm font-semibold tracking-widest text-accent">FAQ</p>
        <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
          Правила и частые вопросы
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-dim">
          Условия сервиса, покупки и доставки предметов CS2. Полные версии документов — по ссылкам
          внутри каждого раздела.
        </p>
      </div>

      <div className="mt-10 space-y-3">
        {policies.length === 0 ? (
          <div className="panel px-5 py-10 text-center text-ink-dim">
            Пока нет доступных документов.
          </div>
        ) : (
          policies.map((p) => (
            <details key={p.slug} className="panel group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-semibold [&::-webkit-details-marker]:hidden">
                {p.title}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  className="shrink-0 text-accent transition-transform duration-200 group-open:rotate-45"
                  aria-hidden
                >
                  <path
                    d="M9 3v12M3 9h12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </summary>
              <div
                className={`mt-3 ${PROSE}`}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(p.bodyMd) }}
              />
              <div className="mt-4 border-t border-line pt-3">
                <Link
                  href={`/policy/${p.slug}`}
                  className="text-sm font-medium text-accent transition-colors hover:text-accent-hot"
                >
                  Открыть полную версию →
                </Link>
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}
