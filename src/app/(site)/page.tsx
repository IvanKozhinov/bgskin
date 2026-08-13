// BGASkins.cc landing page. Server shell; interactive sections live in
// client components under src/components/landing/.

import Link from "next/link";
import type { ReactNode } from "react";
import LiveFeedPanel from "@/components/LiveFeedPanel";
import Hero from "@/components/landing/Hero";
import HotItems from "@/components/landing/HotItems";
import Reveal from "@/components/landing/Reveal";
import StatsRow from "@/components/landing/StatsRow";

const STEPS: { num: string; title: string; text: string; icon: ReactNode }[] = [
  {
    num: "01",
    title: "Войди через Steam",
    text: "Один клик — авторизация через официальный Steam OpenID. Никаких паролей и лишних анкет.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2a10 10 0 0 0-9.97 9.24l5.35 2.21a2.83 2.83 0 0 1 1.6-.5h.14l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43v.12a2.83 2.83 0 1 1-5.66 0v-.09l-3.83-1.58A10 10 0 1 0 12 2Zm-5.7 13.5 1.23.51a2.12 2.12 0 1 0 1.1-2.94l1.27.52a1.56 1.56 0 1 1-3.6 1.91Zm9-4.04a2.51 2.51 0 1 1 0-5.02 2.51 2.51 0 0 1 0 5.02Zm0-.63a1.89 1.89 0 1 0 0-3.77 1.89 1.89 0 0 0 0 3.77Z" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Выбери скин и оплати",
    text: "Живой каталог с честными ценами: фильтры по редкости, оружию и бюджету. Оплата с баланса в пару кликов.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M2.5 3.5h3l2.6 12h10.4l2-8.5H6.2" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Прими трейд-оффер",
    text: "Бот мгновенно отправляет предложение обмена на твою трейд-ссылку. Принял — предмет в инвентаре.",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 7h13m0 0-3.5-3.5M17 7l-3.5 3.5" />
        <path d="M20 17H7m0 0 3.5-3.5M7 17l3.5 3.5" />
      </svg>
    ),
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Как быстро приходит предмет?",
    a: "Обычно трейд-оффер прилетает в течение 1–5 минут после оплаты. В часы пиковой нагрузки на рынке доставка может занять до 15 минут — статус заказа всегда виден в профиле.",
  },
  {
    q: "Нужен ли Trade URL?",
    a: "Да. Трейд-ссылка нужна, чтобы бот мог отправить вам предложение обмена. Найти её можно в Steam: Инвентарь → Предложения обмена → «Кто может отправлять мне предложения». Ссылка сохраняется в профиле один раз.",
  },
  {
    q: "Откуда предметы?",
    a: "Предметы закупаются в момент заказа у проверенных маркет-поставщиков. Мы не храним «серые» скины: каждый предмет проходит через официальную систему обмена Steam.",
  },
  {
    q: "Что если трейд не пришёл?",
    a: "Если предложение обмена не удалось отправить или оно было отменено, заказ помечается как неуспешный, а средства автоматически возвращаются на баланс. Спорные случаи разбирает поддержка 24/7.",
  },
];

export default function Home() {
  return (
    <div>
      {/* HERO */}
      <Hero />

      {/* Stats strip */}
      <section className="relative z-10 mx-auto -mt-12 max-w-7xl px-4 sm:px-6">
        <StatsRow />
      </section>

      {/* Live feed + hot items */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <Reveal>
          <div className="flex flex-col gap-8 lg:flex-row">
            <div className="lg:w-2/5">
              <LiveFeedPanel />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-5 flex items-end justify-between gap-4">
                <h2 className="font-display text-2xl font-bold sm:text-3xl">
                  Горячие <span className="text-accent">предметы</span>
                </h2>
                <Link
                  href="/market"
                  className="shrink-0 text-sm font-medium text-accent transition-colors hover:text-accent-hot"
                >
                  Весь маркет →
                </Link>
              </div>
              <HotItems />
            </div>
          </div>
        </Reveal>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:py-8">
        <Reveal>
          <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-center lg:gap-5 lg:text-left">
            {/* Rendered as a masked background layer, not a plain <img>: the
                artwork has an opaque near-black backdrop, so screen blending
                drops it and the radial mask feathers the edges — otherwise a
                hard black square shows against the page. */}
            <div
              aria-hidden
              className="h-28 w-28 shrink-0 bg-contain bg-center bg-no-repeat sm:h-32 sm:w-32"
              style={{
                backgroundImage: "url(/art/steps-trade.webp)",
                mixBlendMode: "screen",
                maskImage: "radial-gradient(circle at 50% 50%, #000 52%, transparent 76%)",
                WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 52%, transparent 76%)",
                filter: "drop-shadow(0 8px 24px rgba(255,140,0,0.28))",
              }}
            />
            <div>
              <p className="font-display text-sm font-semibold tracking-widest text-accent">
                ТРИ ПРОСТЫХ ШАГА
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Как это работает</h2>
            </div>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.num} delay={i * 0.12}>
              <div className="panel group relative h-full overflow-hidden p-6 transition-transform duration-200 hover:-translate-y-1.5">
                <span className="pointer-events-none absolute -top-3 right-3 font-display text-7xl font-bold text-ink-faint/25 transition-colors duration-300 group-hover:text-accent/20">
                  {step.num}
                </span>
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                  {step.icon}
                </div>
                <h3 className="mt-5 font-display text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
        <Reveal>
          <div className="text-center">
            <p className="font-display text-sm font-semibold tracking-widest text-accent">FAQ</p>
            <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Частые вопросы</h2>
          </div>
        </Reveal>
        <div className="mt-10 space-y-3">
          {FAQ.map((item, i) => (
            <Reveal key={item.q} delay={i * 0.06}>
              <details className="panel group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-semibold [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    className="shrink-0 text-accent transition-transform duration-200 group-open:rotate-45"
                    aria-hidden
                  >
                    <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-dim">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Bottom CTA band */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:pb-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-accent/20 px-6 py-16 text-center sm:px-12 sm:py-20">
            {/* Layered warm panel wash */}
            <div className="pointer-events-none absolute inset-0 bg-panel" />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(130% 150% at 100% 0%, rgba(255,106,0,0.16), transparent 55%), radial-gradient(120% 140% at 0% 100%, rgba(255,177,41,0.10), transparent 50%)",
              }}
            />
            {/* Top hairline highlight */}
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
            <div className="blob -left-24 -top-24 h-64 w-64 bg-accent/20" />
            {/* Decorative knife — feathered into the panel so no image edges show.
                Screen blend drops the near-black backdrop; the radial mask fades
                every edge of the bitmap to transparent. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 hidden w-2/3 lg:block"
              style={{
                backgroundImage: "url(/art/hero-knife.webp)",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 58%",
                backgroundSize: "auto 168%",
                mixBlendMode: "screen",
                opacity: 0.6,
                maskImage: "radial-gradient(62% 82% at 78% 54%, #000 28%, transparent 70%)",
                WebkitMaskImage: "radial-gradient(62% 82% at 78% 54%, #000 28%, transparent 70%)",
              }}
            />
            <div className="relative">
              <h2 className="font-display text-3xl font-bold sm:text-4xl">
                Готов обновить <span className="text-glow text-accent">инвентарь</span>?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-ink-dim">
                Сотни скинов уже в каталоге — от бюджетных пистолетов до коллекционных ножей.
                Доставка занимает считанные минуты.
              </p>
              <Link href="/market" className="btn-primary mt-8">
                Открыть маркет
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
