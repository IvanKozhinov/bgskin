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

- **`SESSION_SECRET` обязателен в проде** — приложение не стартует без него
  (иначе сессии подписывались бы публичным dev-ключом = взлом любого аккаунта).
- **`SITE_URL` должен совпадать с реальным хостом** — Steam OpenID возвращает
  пользователя на `SITE_URL/api/auth/steam/return`; при несовпадении вход молча
  не сработает. Локально сервер поднят на порту 3050 → `SITE_URL=http://localhost:3050`.
- Домена пока нет — при появлении смените `SITE_URL`, добавьте домен в настройки
  Steam API key и укажите вебхук `SITE_URL/api/skinsback/callback` в кабинете Skinsback.

### Переход демо → live

При появлении `SKINSBACK_*` ключей приложение переключается в live-режим:
демо-балансы обнуляются автоматически (play-money не должны тратиться на реальные
выводы), а цены берутся из прайса Skinsback. Предметы, которых нет в прайсе,
помечаются недоступными и не продаются.

**Пополнение баланса в live-режиме пока не реализовано** — ТЗ покрывает вывод
предметов и автообновление цен, но не приём платежей. Чтобы пользователи могли
покупать, нужно подключить платёжный провайдер (например, депозитный API
Skinsback), который вызывает `credit(steamId, cents)` из [src/lib/db.ts](src/lib/db.ts),
либо временно пополнять баланс вручную через SQLite. Это следующий шаг перед
боевым запуском.
