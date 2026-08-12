# BGASkins — v2 build spec (admin, payments, policies, feed config, de-demo)

Foundation (already written — import, DO NOT modify): `src/lib/{config,db,types,session,admin,totp,geo,events,policies,feedcfg,payments,md,skinsback,catalog,feed}.ts`, `src/app/api/{me,buy}/route.ts`.

## Key exports (code against these EXACTLY — read the files)
- `@/lib/admin`: `checkAdminPassword(u,p)→{ok,totpRequired}`, `checkAdminTotp(token)→bool`, `createAdminSession(username,mfa)`, `clearAdminSession()`, `getAdminSession()→{username,mfa}|null`, `isAdminAuthed()→Promise<bool>`.
- `@/lib/totp`: `generateTotpSecret()`, `verifyTotp(token,secret)`, `totpQrDataUrl(username,secret)→Promise<dataurl>`.
- `@/lib/db`: admin `getAdmin()`,`setAdminTotp(secret,enabled)`; events `insertEvent`,`listEventsByUser(steamId,limit)`,`listRecentEvents(limit)`; users `listUsersForAdmin({limit,offset,search})`,`getUser`,`adminStats()`; policies via `@/lib/policies`; deposits `listDepositsByUser`,`getDepositRow`,`markDepositPaidOnce(id)`; feed via `@/lib/feedcfg`.
- `@/lib/policies`: `listPolicies(includeUnpublished?)`,`getPolicy(slug)`,`footerPolicies()`,`faqPolicies()`,`savePolicy({slug,title,bodyMd,published,showInFaq,sortOrder})`,`removePolicy(slug)`.
- `@/lib/md`: `renderMarkdown(md)→html` (already escapes; safe to inject with dangerouslySetInnerHTML).
- `@/lib/feedcfg`: `getFeedConfig()→FeedConfig`, `setFeedConfig(patch)→FeedConfig`, `DEFAULT_FEED_CONFIG`.
- `@/lib/payments`: `listPaymentMethods()→PaymentMethodInfo[]`, `createDepositIntent({steamId,amountCents,method})→Promise<DepositResponse>`, `verifyStripeWebhook(raw,sig)→depositId|null`, `MIN_DEPOSIT_CENTS`,`MAX_DEPOSIT_CENTS`.
- `@/lib/events`: `logEvent(request,{steamId?,type,path?,meta?})` (async, never throws).
- `@/lib/session`: `getSessionUser()`, `getSessionSteamId()`.
- Types in `@/lib/types`: `MeResponse{user}` (NO `demo` anymore), `BuyResponse` (now has `needsTradeUrl`,`needsDeposit`,`fulfillmentUnavailable`,`pending`,`priceChanged`,`currentPriceCents`), `UserEvent`,`AdminUserRow`,`Policy`,`FeedConfig`,`PaymentMethodInfo`,`PaymentMethodId`,`Deposit`,`DepositResponse`.

## Conventions
- Next 16 App Router, TS strict, Tailwind v4 tokens (bg, bg-elevated, panel, panel-2, line, line-bright, ink, ink-dim, ink-faint, accent, accent-hot, violet, pos, neg), `.btn-primary .btn-ghost .card .panel .input .font-display`. UI language: RUSSIAN.
- API routes touching db/fs: `export const runtime = "nodejs"`. Dynamic reads: `export const dynamic = "force-dynamic"`.
- Money = integer cents; format via `formatPrice` from `@/lib/types`.
- Admin session cookie is separate (`bga_admin`). Every `/api/admin/*` route must call `isAdminAuthed()` and 403 if false. Every protected `/admin/*` page must redirect to `/admin/login` if `!isAdminAuthed()`.
- Storefront chrome (Header, Footer, FeedTicker) must render `null` when `usePathname()` starts with `/admin`.
- No new npm deps (available: better-sqlite3, jose, framer-motion, otplib, qrcode). Do not run build/tsc project-wide or start servers.

## DEMO removal (already done in lib/api; UI must follow)
`MeResponse` no longer has `demo`. Remove all "DEMO"/"демо-режим"/"симуляция" copy and badges. New users have $0 balance. Buying requires trade link + balance; `/api/buy` returns `needsTradeUrl`/`needsDeposit`/`fulfillmentUnavailable` flags — the UI must react (prompt trade URL / route to /wallet / show "выдача подключается").
