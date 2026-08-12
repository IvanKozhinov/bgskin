# BGASkins.cc — Architecture

CS2 skins storefront. Next.js 15 (App Router, TS, Tailwind v4), SQLite (better-sqlite3), JWT cookie sessions (jose).

## Modes
- **DEMO mode** (default, no keys): deterministic fake prices, fake balance ($100 for new users), purchases create `demo_delivered` orders. Everything works locally with zero configuration.
- **LIVE mode** (keys in `.env`): Skinsback price list auto-refresh, real purchase/withdraw via Skinsback market API, callbacks update order status.

Mode is decided per-subsystem: Steam profile enrichment uses `STEAM_API_KEY` if present (keyless XML fallback otherwise); Skinsback goes live when `SKINSBACK_SHOP_ID` + `SKINSBACK_SECRET` are set.

## Env (`.env.local`, see `.env.example`)
- `SITE_URL` (default http://localhost:3000)
- `SESSION_SECRET` (JWT HS256; dev fallback baked in)
- `STEAM_API_KEY` (optional)
- `SKINSBACK_SHOP_ID`, `SKINSBACK_SECRET` (optional → live mode)
- `OPENROUTER_API_KEY` (optional, art generation script only)

## Data
- `data/catalog.json` — slimmed CS2 item catalog, produced by `scripts/fetch-catalog.ts` from ByMykel/CSGO-API. Committed fallback `data/catalog.seed.json` (small subset, ~200 items) so the app runs before the first fetch.
- `data/bgaskins.db` — SQLite: `users(steam_id TEXT PK, name, avatar, trade_url, balance_cents INTEGER, created_at)`, `orders(id INTEGER PK AUTOINCREMENT, user_steam_id, item_id, item_name, price_cents, status, skinsback_order_id, created_at, updated_at)`.
- Order statuses: `pending → processing → sent → delivered` | `failed` | `demo_delivered`.

## Shared types — `src/lib/types.ts` (single source of truth, already written; do not redefine)

## Modules (`src/lib/`)
- `config.ts` — env parsing, `isSkinsbackLive()`, `siteUrl()`.
- `db.ts` — better-sqlite3 singleton, schema bootstrap, user/order helpers.
- `session.ts` — `createSession(steamId)`, `getSession()` (reads cookie), `clearSession()`; cookie `bga_session`, httpOnly, 30d.
- `steam.ts` — OpenID 2.0: `steamLoginUrl(returnTo)`, `verifySteamCallback(searchParams)` → steamid64; `fetchSteamProfile(steamId)` → {name, avatar} (Web API or keyless XML fallback).
- `catalog.ts` — loads catalog JSON, in-memory index; `queryCatalog(filters)` (search, category, weapon, rarity, price range, stattrak, sort, pagination); merges prices from `prices.ts`.
- `prices.ts` — price provider. Demo: deterministic hash-based prices. Live: Skinsback pricelist cached, auto-refresh every 10 min (lazy interval, survives across requests via globalThis singleton).
- `skinsback.ts` — API client (sign requests per Skinsback docs), `getPricelist()`, `buyItem(name, maxPrice, tradeUrl)`, `orderStatus(id)`, callback signature verify.
- `feed.ts` — fake live feed: globalThis singleton generates a purchase event every 3–9 s from real catalog items + pool of buyer nicknames; ring buffer (last 60); subscribers for SSE.

## API routes (`src/app/api/`)
- `auth/steam/route.ts` — GET → 302 to Steam OpenID.
- `auth/steam/return/route.ts` — GET → verify, upsert user, set cookie, 302 `/`.
- `auth/logout/route.ts` — POST → clear cookie.
- `me/route.ts` — GET → `{user: SessionUser | null, demo: boolean}`.
- `catalog/route.ts` — GET with query params → `CatalogResponse` (items, total, page, facets: weapon list, rarity list, price bounds).
- `feed/route.ts` — GET SSE stream of `FeedEvent`s (sends last 20 on connect, then live). `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.
- `buy/route.ts` — POST `{itemId: string}` → auth required; trade URL required in live mode; balance check; demo → instant `demo_delivered`; live → Skinsback buy, order `processing`.
- `orders/route.ts` — GET → current user's orders.
- `user/tradeurl/route.ts` — POST `{tradeUrl}` → validate format, save.
- `skinsback/callback/route.ts` — POST webhook → verify sig, update order status.

## Pages (`src/app/`)
- `/` landing: hero (name, tagline, CTA), live-feed ticker strip, featured/hot items row, stats counters, "how it works" 3 steps, FAQ teaser.
- `/market` — catalog: sticky filter sidebar (category, rarity chips colored per CS2 palette, price range, StatTrak toggle), search bar, sort select, responsive card grid, pagination ("load more"), buy button on card → BuyModal.
- `/item/[id]` — big render, rarity gradient backdrop, float range bar, price, buy panel, similar items.
- `/profile` — Steam avatar/name, balance, trade URL form, order history table.
- `layout.tsx` — fonts, Header (logo BGA/Skins, nav, balance pill, Steam sign-in button), Footer, global FeedTicker on all pages (thin strip under header).

## Design system (globals.css — already written; use its tokens)
Dark neon gaming aesthetic. Tokens: `--bg #0a0c10`, panels `#11141b/#161a24`, accent amber `#ffb129` + hot orange `#ff6a00`, secondary electric violet `#8847ff`. CS2 rarity palette: consumer `#b0c3d9`, industrial `#5e98d9`, milspec `#4b69ff`, restricted `#8847ff`, classified `#d32ce6`, covert `#eb4b4b`, contraband/gold `#e4ae39`. Fonts: Chakra Petch (display, via next/font), Inter (body). Effects: card hover lift+glow in rarity color, animated gradient hero, ticker slide-in animations (framer-motion), subtle grid/noise background.

## Rules for contributors (agents)
- Only touch files assigned to you. Shared contracts live in `src/lib/types.ts` — import, never redefine.
- No new npm deps (installed: better-sqlite3, jose, framer-motion; dev: tsx, @types/better-sqlite3).
- Tailwind v4: theme via `@theme` in globals.css, no tailwind.config.
- All server code Node runtime (better-sqlite3), add `export const runtime = 'nodejs'` to API routes that touch db/fs.
- Money is integer cents everywhere; format with `formatPrice` from types.ts helpers.
- Item images come from catalog `image` URLs (Steam CDN); use `<img>` (remote domains not configured for next/image) with `loading="lazy"`.
