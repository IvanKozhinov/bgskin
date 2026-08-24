// Public policy document page (/policy/<slug>). Only published policies are
// visible; drafts and unknown slugs 404.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPolicy } from "@/lib/policies";
import { renderMarkdown } from "@/lib/md";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tailwind descendant styling for the injected Markdown HTML.
const PROSE =
  "text-ink-dim leading-relaxed " +
  "[&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink " +
  "[&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-ink " +
  "[&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:font-display [&_h4]:font-semibold [&_h4]:text-ink " +
  "[&_h5]:mt-5 [&_h5]:mb-1.5 [&_h5]:font-semibold [&_h5]:text-ink " +
  "[&_p]:my-4 " +
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 " +
  "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 " +
  "[&_li]:marker:text-accent " +
  "[&_strong]:font-semibold [&_strong]:text-ink " +
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-accent-hot " +
  "[&_code]:rounded [&_code]:bg-bg-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:text-accent";

function formatDate(iso: string): string {
  // sqlite datetime('now') → "YYYY-MM-DD HH:MM:SS" (UTC, space-separated).
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso)
    ? `${iso.replace(" ", "T")}Z`
    : iso;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = getPolicy(slug);
  if (!p || !p.published) return { title: "Документ не найден — BGSkins.pro" };
  return {
    title: `${p.title} — BGSkins.pro`,
    description: `${p.title} — BGSkins.pro.`,
  };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getPolicy(slug);
  if (!p || !p.published) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-ink-dim transition-colors hover:text-accent"
      >
        ← На главную
      </Link>

      <h1 className="mt-6 font-display text-3xl font-bold sm:text-4xl">{p.title}</h1>
      <p className="mt-2 text-sm text-ink-faint">Обновлено: {formatDate(p.updatedAt)}</p>

      <div className="my-6 h-px bg-line" />

      <div className={PROSE} dangerouslySetInnerHTML={{ __html: renderMarkdown(p.bodyMd) }} />

      <div className="mt-12 border-t border-line pt-6">
        <Link href="/faq" className="text-sm text-accent transition-colors hover:text-accent-hot">
          Все правила и документы →
        </Link>
      </div>
    </article>
  );
}
