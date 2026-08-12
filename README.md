# BGASkins.cc

Витрина продажи скинов CS2: Steam-авторизация, живой каталог с фильтрами и поиском,
лайв-лента покупок, интеграция Skinsback (автообновление цен + вывод предметов трейд-оффером).

Стек: Next.js 16 (App Router) · TypeScript · Tailwind v4 · SQLite (better-sqlite3) · framer-motion.

## Быстрый старт

```bash
npm install
npx tsx scripts/fetch-catalog.ts   # скачать актуальный каталог предметов CS2 (~2000 скинов)
npm run dev                        # http://localhost:3000
```

Без единого ключа проект работает в **демо-режиме**: цены детерминированно-фиктивные
(слегка «дышат» каждые 10 минут), новым пользователям начисляется $100 демо-баланса,
покупка мгновенно создаёт заказ со статусом «Доставлен (демо)». Лайв-лента покупок —
симуляция (по ТЗ), генерируется сервером из реальных предметов каталога.

## Режимы и ключи (`.env.local`, см. `.env.example`)

| Ключ | Что включает |
|---|---|
| `SITE_URL` | Публичный URL (для Steam OpenID return URL). Локально — `http://localhost:3000` |
| `SESSION_SECRET` | Подпись сессионных куки (обязательно смените в проде) |
| `STEAM_API_KEY` | Ник/аватар через официальный Web API (без ключа — keyless-fоллбек) |
| `SKINSBACK_SHOP_ID` + `SKINSBACK_SECRET` | **LIVE-режим**: реальный прайс Skinsback (автообновление каждые 10 мин) и реальный вывод предметов через `market_buy` |
| `OPENROUTER_API_KEY` | Генерация фирменных артов (GPT Image 2): `npx tsx scripts/generate-art.ts` |

Вебхук Skinsback (статусы трейдов): укажите в кабинете Skinsback URL
`<SITE_URL>/api/skinsback/callback` — подпись проверяется (HMAC-SHA256 от raw body).

## Что где

- `src/lib/` — ядро: `catalog` (каталог+цены), `skinsback` (API-клиент), `steam` (OpenID),
  `feed` (лайв-лента), `db`, `session`, `prices`, `config`
- `src/app/api/` — REST: `catalog`, `feed` (SSE), `buy`, `orders`, `auth/steam/*`, `me`,
  `user/tradeurl`, `skinsback/callback`
- `src/app/` — страницы: `/` (лендинг), `/market`, `/item/[id]`, `/profile`
- `scripts/fetch-catalog.ts` — обновление каталога из ByMykel/CSGO-API
- `scripts/generate-art.ts` — арты через OpenRouter (GPT Image 2)
- `data/` — `catalog.json`, `bgaskins.db` (SQLite, создаётся автоматически)

## Продакшен

```bash
npm run build && npm run start
```

Домена пока нет — при появлении смените `SITE_URL`, добавьте домен в настройки
Steam API key и вебхук в кабинете Skinsback.
