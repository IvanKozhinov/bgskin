"use client";

// Policy editor with a live server-rendered Markdown preview. The Markdown
// renderer is Node-only (@/lib/md), so we never import it here — the draft body
// is POSTed (debounced) to /api/admin/policies/preview and the returned HTML is
// injected into the preview pane.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface PolicyInitial {
  slug: string;
  title: string;
  bodyMd: string;
  published: boolean;
  showInFaq: boolean;
  sortOrder: number;
}

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

// Tailwind descendant styling for injected Markdown HTML (h2..h5, p, ul/ol, li,
// a, strong, em, code). renderMarkdown reserves h1 for the page title.
const PROSE =
  "text-ink-dim leading-relaxed " +
  "[&_h2]:mt-7 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink " +
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-ink " +
  "[&_h4]:mt-5 [&_h4]:mb-2 [&_h4]:font-display [&_h4]:font-semibold [&_h4]:text-ink " +
  "[&_h5]:mt-4 [&_h5]:mb-1.5 [&_h5]:font-semibold [&_h5]:text-ink " +
  "[&_p]:my-3 " +
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 " +
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6 " +
  "[&_li]:marker:text-accent " +
  "[&_strong]:font-semibold [&_strong]:text-ink " +
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-accent-hot " +
  "[&_code]:rounded [&_code]:bg-bg-elevated [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:text-accent";

export default function PolicyEditor({
  initial,
  isNew,
}: {
  initial: PolicyInitial;
  isNew: boolean;
}) {
  const router = useRouter();

  const [slug, setSlug] = useState(initial.slug);
  const [title, setTitle] = useState(initial.title);
  const [bodyMd, setBodyMd] = useState(initial.bodyMd);
  const [published, setPublished] = useState(initial.published);
  const [showInFaq, setShowInFaq] = useState(initial.showInFaq);
  const [sortOrder, setSortOrder] = useState<number>(initial.sortOrder);

  const [previewHtml, setPreviewHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving || deleting;

  // Debounced server-side preview.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/admin/policies/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyMd }),
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { html?: unknown }) =>
          setPreviewHtml(typeof d.html === "string" ? d.html : ""),
        )
        .catch(() => {
          /* aborted or transient — keep the previous preview */
        });
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [bodyMd]);

  const slugRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    const s = slug.trim();
    const t = title.trim();
    if (!SLUG_RE.test(s)) {
      setError("Slug: 2–40 символов, только строчные латинские буквы, цифры и дефис");
      slugRef.current?.focus();
      return;
    }
    if (!t) {
      setError("Введите заголовок");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: s,
          title: t,
          bodyMd,
          published,
          showInFaq,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(d?.error ?? "Не удалось сохранить документ");
        setSaving(false);
        return;
      }
      router.push("/admin/policies");
      router.refresh();
    } catch {
      setError("Сетевая ошибка. Попробуйте ещё раз");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Удалить документ «${initial.title || initial.slug}»?`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/policies/${encodeURIComponent(initial.slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Не удалось удалить документ");
        setDeleting(false);
        return;
      }
      router.push("/admin/policies");
      router.refresh();
    } catch {
      setError("Сетевая ошибка. Попробуйте ещё раз");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/policies"
            className="text-sm text-ink-dim transition-colors hover:text-accent"
          >
            ← К списку документов
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold">
            {isNew ? "Новая политика" : "Редактирование политики"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="btn-ghost text-neg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Удаление…" : "Удалить"}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="btn-primary disabled:cursor-not-allowed"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-neg/40 bg-neg/10 px-4 py-3 text-sm text-neg">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Editor column */}
        <div className="panel flex flex-col gap-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="font-display text-xs font-semibold uppercase tracking-widest text-ink-faint">
                Slug
              </span>
              <input
                ref={slugRef}
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={!isNew}
                placeholder="terms"
                spellCheck={false}
                autoCapitalize="none"
                className="input font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
              <span className="text-xs text-ink-faint">
                Адрес страницы: /policy/{slug || "…"}
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="font-display text-xs font-semibold uppercase tracking-widest text-ink-faint">
                Порядок
              </span>
              <input
                type="number"
                value={Number.isFinite(sortOrder) ? sortOrder : 0}
                onChange={(e) =>
                  setSortOrder(e.target.value === "" ? 0 : Math.trunc(Number(e.target.value)))
                }
                className="input text-sm"
              />
              <span className="text-xs text-ink-faint">Меньше — выше в списках</span>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-display text-xs font-semibold uppercase tracking-widest text-ink-faint">
              Заголовок
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Пользовательское соглашение"
              className="input text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-display text-xs font-semibold uppercase tracking-widest text-ink-faint">
              Текст (Markdown)
            </span>
            <textarea
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              rows={22}
              spellCheck={false}
              placeholder={"## Заголовок раздела\nТекст абзаца.\n\n- пункт списка\n- ещё пункт"}
              className="input min-h-[26rem] resize-y font-mono text-[13px] leading-relaxed"
            />
            <span className="text-xs text-ink-faint">
              Поддерживается: ## заголовки, **жирный**, *курсив*, списки, [ссылки](https://…), `код`
            </span>
          </label>

          <div className="flex flex-wrap gap-6 border-t border-line pt-4">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              <span>Опубликовано</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={showInFaq}
                onChange={(e) => setShowInFaq(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              <span>Показывать в FAQ</span>
            </label>
          </div>
        </div>

        {/* Preview column */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="panel p-6">
            <div className="mb-4 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-widest text-ink-faint">
              <span className="live-dot" aria-hidden />
              Предпросмотр
            </div>
            <h2 className="font-display text-2xl font-bold text-ink">
              {title || "Заголовок документа"}
            </h2>
            {previewHtml ? (
              <div
                className={`mt-4 ${PROSE}`}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <p className="mt-4 text-sm text-ink-faint">
                Начните вводить текст — здесь появится отрендеренный документ.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
