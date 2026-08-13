import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { OrderStatus, Order, DepositStatus, PaymentMethodId } from "./types";
import { adminUser, adminPasswordEnv } from "./config";

// Singleton across hot reloads / route invocations.
const globalForDb = globalThis as unknown as { __bgaDb?: Database.Database };

function scryptHash(password: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

export function verifyScrypt(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const dk = scryptSync(password, salt, expected.length);
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

function open(): Database.Database {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "bgaskins.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      steam_id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      trade_url TEXT,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_steam_id TEXT NOT NULL REFERENCES users(steam_id),
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      skinsback_order_id TEXT,
      custom_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_steam_id, id DESC);
    CREATE TABLE IF NOT EXISTS openid_nonces (
      nonce TEXT PRIMARY KEY,
      seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      totp_secret TEXT,
      totp_pending_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT,
      type TEXT NOT NULL,
      ip TEXT,
      country TEXT,
      country_name TEXT,
      path TEXT,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_user ON user_events(steam_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_events_recent ON user_events(id DESC);

    CREATE TABLE IF NOT EXISTS ip_geo (
      ip TEXT PRIMARY KEY,
      country TEXT,
      country_name TEXT,
      cached_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policies (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body_md TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 1,
      show_in_faq INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feed_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pricing_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_steam_id TEXT NOT NULL REFERENCES users(steam_id),
      amount_cents INTEGER NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      provider_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_steam_id, id DESC);
  `);

  // Migration: add the pending-2FA-secret column to pre-existing admin tables.
  try {
    db.prepare("ALTER TABLE admins ADD COLUMN totp_pending_secret TEXT").run();
  } catch {
    // column already exists — ignore
  }

  // Seed the admin row from env (password hashed at rest). If ADMIN_PASSWORD
  // changes, the stored hash is refreshed; the TOTP secret is preserved.
  const existingAdmin = db.prepare("SELECT * FROM admins WHERE id = 1").get() as
    | { username: string; password_hash: string }
    | undefined;
  const pw = adminPasswordEnv() || (process.env.NODE_ENV !== "production" ? "admin" : null);
  if (!existingAdmin) {
    if (pw) {
      db.prepare(
        "INSERT INTO admins (id, username, password_hash) VALUES (1, ?, ?)",
      ).run(adminUser(), scryptHash(pw));
    }
  } else if (pw && !verifyScrypt(pw, existingAdmin.password_hash)) {
    db.prepare("UPDATE admins SET username = ?, password_hash = ? WHERE id = 1").run(
      adminUser(),
      scryptHash(pw),
    );
  } else if (existingAdmin.username !== adminUser()) {
    db.prepare("UPDATE admins SET username = ? WHERE id = 1").run(adminUser());
  }

  db.prepare(
    "INSERT INTO feed_config (id, config) VALUES (1, '{}') ON CONFLICT(id) DO NOTHING",
  ).run();

  db.prepare(
    "INSERT INTO pricing_config (id, config) VALUES (1, '{}') ON CONFLICT(id) DO NOTHING",
  ).run();

  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__bgaDb) globalForDb.__bgaDb = open();
  return globalForDb.__bgaDb;
}

// ---- Users -------------------------------------------------------------------

export interface DbUser {
  steam_id: string;
  name: string;
  avatar: string;
  trade_url: string | null;
  balance_cents: number;
  created_at: string;
}

export function upsertUser(steamId: string, name: string, avatar: string): DbUser {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM users WHERE steam_id = ?")
    .get(steamId) as DbUser | undefined;
  if (existing) {
    db.prepare("UPDATE users SET name = ?, avatar = ? WHERE steam_id = ?").run(
      name,
      avatar,
      steamId,
    );
    return { ...existing, name, avatar };
  }
  // New users start at zero — balance is funded only via real deposits.
  db.prepare(
    "INSERT INTO users (steam_id, name, avatar, balance_cents) VALUES (?, ?, ?, 0)",
  ).run(steamId, name, avatar);
  return db.prepare("SELECT * FROM users WHERE steam_id = ?").get(steamId) as DbUser;
}

export function getUser(steamId: string): DbUser | null {
  return (
    (getDb().prepare("SELECT * FROM users WHERE steam_id = ?").get(steamId) as
      | DbUser
      | undefined) ?? null
  );
}

export function setTradeUrl(steamId: string, tradeUrl: string): void {
  getDb().prepare("UPDATE users SET trade_url = ? WHERE steam_id = ?").run(tradeUrl, steamId);
}

/** Atomically deduct balance; returns false if insufficient. */
export function tryDebit(steamId: string, cents: number): boolean {
  const res = getDb()
    .prepare(
      "UPDATE users SET balance_cents = balance_cents - ? WHERE steam_id = ? AND balance_cents >= ?",
    )
    .run(cents, steamId, cents);
  return res.changes > 0;
}

export function credit(steamId: string, cents: number): void {
  getDb()
    .prepare("UPDATE users SET balance_cents = balance_cents + ? WHERE steam_id = ?")
    .run(cents, steamId);
}

// ---- Orders ------------------------------------------------------------------

interface DbOrder {
  id: number;
  user_steam_id: string;
  item_id: string;
  item_name: string;
  price_cents: number;
  status: OrderStatus;
  skinsback_order_id: string | null;
  custom_id: string | null;
  created_at: string;
  updated_at: string;
}

export function createOrder(o: {
  userSteamId: string;
  itemId: string;
  itemName: string;
  priceCents: number;
  status: OrderStatus;
  customId?: string;
  skinsbackOrderId?: string;
}): Order {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO orders (user_steam_id, item_id, item_name, price_cents, status, custom_id, skinsback_order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      o.userSteamId,
      o.itemId,
      o.itemName,
      o.priceCents,
      o.status,
      o.customId ?? null,
      o.skinsbackOrderId ?? null,
    );
  return getOrderById(Number(res.lastInsertRowid))!;
}

function rowToOrder(r: DbOrder): Order {
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: r.item_name,
    priceCents: r.price_cents,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function getOrderById(id: number): Order | null {
  const r = getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as DbOrder | undefined;
  return r ? rowToOrder(r) : null;
}

export function getOrderRowByCustomId(customId: string): {
  order: Order;
  userSteamId: string;
} | null {
  const r = getDb().prepare("SELECT * FROM orders WHERE custom_id = ?").get(customId) as
    | DbOrder
    | undefined;
  return r ? { order: rowToOrder(r), userSteamId: r.user_steam_id } : null;
}

export function listOrders(steamId: string, limit = 50): Order[] {
  const rows = getDb()
    .prepare("SELECT * FROM orders WHERE user_steam_id = ? ORDER BY id DESC LIMIT ?")
    .all(steamId, limit) as DbOrder[];
  return rows.map(rowToOrder);
}

export function updateOrderStatus(opts: {
  customId?: string;
  skinsbackOrderId?: string;
  status: OrderStatus;
}): void {
  const db = getDb();
  if (opts.customId) {
    db.prepare(
      "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE custom_id = ?",
    ).run(opts.status, opts.customId);
  } else if (opts.skinsbackOrderId) {
    db.prepare(
      "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE skinsback_order_id = ?",
    ).run(opts.status, opts.skinsbackOrderId);
  }
}

const STATUS_RANK: Record<OrderStatus, number> = {
  pending: 0,
  processing: 1,
  sent: 2,
  delivered: 3,
  failed: 3,
  demo_delivered: 3,
};

/** Advance an order's status only forward along the ladder. */
export function advanceOrderStatus(customId: string, status: OrderStatus): void {
  const db = getDb();
  const row = db.prepare("SELECT status FROM orders WHERE custom_id = ?").get(customId) as
    | { status: OrderStatus }
    | undefined;
  if (!row) return;
  if (STATUS_RANK[status] < STATUS_RANK[row.status]) return;
  db.prepare(
    "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE custom_id = ?",
  ).run(status, customId);
}

/** Atomically fail an order and refund its price to the buyer — exactly once. */
export function failAndRefundOnce(customId: string): boolean {
  const db = getDb();
  const tx = db.transaction((cid: string): boolean => {
    const row = db
      .prepare(
        "SELECT user_steam_id AS u, price_cents AS p, status AS s FROM orders WHERE custom_id = ?",
      )
      .get(cid) as { u: string; p: number; s: OrderStatus } | undefined;
    if (!row) return false;
    // Refundable from any unfinished state. "sent" (trade offer waiting) very
    // much included: a user who never accepts ends in timeout/canceled, and
    // that must return the money. Only a delivered item or an already-refunded
    // order is final.
    if (row.s === "delivered" || row.s === "failed") return false;
    db.prepare(
      "UPDATE orders SET status = 'failed', updated_at = datetime('now') WHERE custom_id = ?",
    ).run(cid);
    db.prepare("UPDATE users SET balance_cents = balance_cents + ? WHERE steam_id = ?").run(
      row.p,
      row.u,
    );
    return true;
  });
  return tx(customId);
}

/**
 * Orders still in flight and untouched for a while — the reconciler polls these
 * against Skinsback in case a webhook never arrived.
 */
export function listStaleOpenOrders(
  olderThanSeconds: number,
  limit = 50,
): { customId: string; status: OrderStatus; ageSeconds: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT custom_id AS customId, status,
              CAST((julianday('now') - julianday(updated_at)) * 86400 AS INTEGER) AS ageSeconds
         FROM orders
        WHERE status IN ('pending','processing','sent')
          AND updated_at <= datetime('now', ?)
        ORDER BY updated_at ASC
        LIMIT ?`,
    )
    .all(`-${Math.max(1, Math.round(olderThanSeconds))} seconds`, limit) as {
    customId: string;
    status: OrderStatus;
    ageSeconds: number;
  }[];
  return rows;
}

export function setOrderSkinsbackId(orderId: number, skinsbackOrderId: string): void {
  getDb()
    .prepare(
      "UPDATE orders SET skinsback_order_id = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(skinsbackOrderId, orderId);
}

/** OpenID replay protection. Returns true if nonce was fresh (and records it). */
export function consumeNonce(nonce: string): boolean {
  const db = getDb();
  try {
    db.prepare("INSERT INTO openid_nonces (nonce) VALUES (?)").run(nonce);
    db.prepare("DELETE FROM openid_nonces WHERE seen_at < datetime('now', '-1 day')").run();
    return true;
  } catch {
    return false;
  }
}

// ---- Admin -------------------------------------------------------------------

export interface DbAdmin {
  id: number;
  username: string;
  password_hash: string;
  totp_secret: string | null;
  totp_pending_secret: string | null;
  totp_enabled: number;
  created_at: string;
}

export function getAdmin(): DbAdmin | null {
  return (
    (getDb().prepare("SELECT * FROM admins WHERE id = 1").get() as DbAdmin | undefined) ?? null
  );
}

/** Stage a candidate 2FA secret WITHOUT touching the live secret/enabled flag. */
export function setAdminPendingTotp(secret: string): void {
  getDb().prepare("UPDATE admins SET totp_pending_secret = ? WHERE id = 1").run(secret);
}

/** Promote the pending secret to live and enable 2FA (after code verification). */
export function promoteAdminTotp(): void {
  getDb()
    .prepare(
      "UPDATE admins SET totp_secret = totp_pending_secret, totp_pending_secret = NULL, totp_enabled = 1 WHERE id = 1 AND totp_pending_secret IS NOT NULL",
    )
    .run();
}

/** Disable 2FA and clear all secrets. */
export function disableAdminTotp(): void {
  getDb()
    .prepare(
      "UPDATE admins SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled = 0 WHERE id = 1",
    )
    .run();
}

// ---- Events / audit ----------------------------------------------------------

interface DbEvent {
  id: number;
  steam_id: string | null;
  type: string;
  ip: string | null;
  country: string | null;
  country_name: string | null;
  path: string | null;
  meta: string | null;
  created_at: string;
}

const EVENT_CAP = 50_000;

export function insertEvent(e: {
  steamId: string | null;
  type: string;
  ip: string | null;
  country: string | null;
  countryName: string | null;
  path: string | null;
  meta: Record<string, unknown> | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO user_events (steam_id, type, ip, country, country_name, path, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    e.steamId,
    e.type,
    e.ip,
    e.country,
    e.countryName,
    e.path,
    e.meta ? JSON.stringify(e.meta) : null,
  );
  // Opportunistically cap the audit log so it can't grow unbounded.
  if (Math.random() < 0.02) {
    db.prepare(
      "DELETE FROM user_events WHERE id <= (SELECT MAX(id) FROM user_events) - ?",
    ).run(EVENT_CAP);
  }
}

function rowToEvent(r: DbEvent) {
  return {
    id: r.id,
    steamId: r.steam_id,
    type: r.type,
    ip: r.ip,
    country: r.country,
    countryName: r.country_name,
    path: r.path,
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null,
    createdAt: r.created_at,
  };
}

export function listEventsByUser(steamId: string, limit = 200) {
  const rows = getDb()
    .prepare("SELECT * FROM user_events WHERE steam_id = ? ORDER BY id DESC LIMIT ?")
    .all(steamId, limit) as DbEvent[];
  return rows.map(rowToEvent);
}

export function listRecentEvents(limit = 200) {
  const rows = getDb()
    .prepare("SELECT * FROM user_events ORDER BY id DESC LIMIT ?")
    .all(limit) as DbEvent[];
  return rows.map(rowToEvent);
}

// ---- IP geolocation cache ----------------------------------------------------

export function getGeoCache(ip: string): { country: string | null; countryName: string | null } | null {
  const r = getDb()
    .prepare("SELECT country, country_name FROM ip_geo WHERE ip = ?")
    .get(ip) as { country: string | null; country_name: string | null } | undefined;
  return r ? { country: r.country, countryName: r.country_name } : null;
}

export function setGeoCache(ip: string, country: string | null, countryName: string | null): void {
  getDb()
    .prepare(
      "INSERT INTO ip_geo (ip, country, country_name) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET country = excluded.country, country_name = excluded.country_name, cached_at = datetime('now')",
    )
    .run(ip, country, countryName);
}

// ---- Policies ----------------------------------------------------------------

interface DbPolicy {
  slug: string;
  title: string;
  body_md: string;
  published: number;
  show_in_faq: number;
  sort_order: number;
  updated_at: string;
}

function rowToPolicy(r: DbPolicy) {
  return {
    slug: r.slug,
    title: r.title,
    bodyMd: r.body_md,
    published: !!r.published,
    showInFaq: !!r.show_in_faq,
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
  };
}

export function listPoliciesRows(includeUnpublished: boolean) {
  const rows = (
    includeUnpublished
      ? getDb().prepare("SELECT * FROM policies ORDER BY sort_order, slug").all()
      : getDb()
          .prepare("SELECT * FROM policies WHERE published = 1 ORDER BY sort_order, slug")
          .all()
  ) as DbPolicy[];
  return rows.map(rowToPolicy);
}

export function getPolicyRow(slug: string) {
  const r = getDb().prepare("SELECT * FROM policies WHERE slug = ?").get(slug) as
    | DbPolicy
    | undefined;
  return r ? rowToPolicy(r) : null;
}

export function upsertPolicyRow(p: {
  slug: string;
  title: string;
  bodyMd: string;
  published: boolean;
  showInFaq: boolean;
  sortOrder: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO policies (slug, title, body_md, published, show_in_faq, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(slug) DO UPDATE SET
         title = excluded.title, body_md = excluded.body_md, published = excluded.published,
         show_in_faq = excluded.show_in_faq, sort_order = excluded.sort_order, updated_at = datetime('now')`,
    )
    .run(p.slug, p.title, p.bodyMd, p.published ? 1 : 0, p.showInFaq ? 1 : 0, p.sortOrder);
}

export function deletePolicyRow(slug: string): void {
  getDb().prepare("DELETE FROM policies WHERE slug = ?").run(slug);
}

export function countPolicies(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM policies").get() as { n: number }).n;
}

// ---- Feed config -------------------------------------------------------------

export function getFeedConfigJson(): string {
  const r = getDb().prepare("SELECT config FROM feed_config WHERE id = 1").get() as
    | { config: string }
    | undefined;
  return r?.config ?? "{}";
}

export function setFeedConfigJson(json: string): void {
  getDb()
    .prepare(
      "INSERT INTO feed_config (id, config, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = datetime('now')",
    )
    .run(json);
}

// ---- Pricing config ----------------------------------------------------------

export function getPricingConfigJson(): string {
  const r = getDb().prepare("SELECT config FROM pricing_config WHERE id = 1").get() as
    | { config: string }
    | undefined;
  return r?.config ?? "{}";
}

export function setPricingConfigJson(json: string): void {
  getDb()
    .prepare(
      "INSERT INTO pricing_config (id, config, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = datetime('now')",
    )
    .run(json);
}

// ---- Deposits ----------------------------------------------------------------

interface DbDeposit {
  id: number;
  user_steam_id: string;
  amount_cents: number;
  method: PaymentMethodId;
  status: DepositStatus;
  provider_ref: string | null;
  created_at: string;
  updated_at: string;
}

export function createDeposit(d: {
  userSteamId: string;
  amountCents: number;
  method: PaymentMethodId;
  status: DepositStatus;
}): number {
  const res = getDb()
    .prepare(
      "INSERT INTO deposits (user_steam_id, amount_cents, method, status) VALUES (?, ?, ?, ?)",
    )
    .run(d.userSteamId, d.amountCents, d.method, d.status);
  return Number(res.lastInsertRowid);
}

export function getDepositRow(id: number): DbDeposit | null {
  return (
    (getDb().prepare("SELECT * FROM deposits WHERE id = ?").get(id) as DbDeposit | undefined) ??
    null
  );
}

export function setDepositProviderRef(id: number, ref: string, status: DepositStatus): void {
  getDb()
    .prepare(
      "UPDATE deposits SET provider_ref = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(ref, status, id);
}

/** Mark a deposit paid and credit the balance exactly once. */
export function markDepositPaidOnce(id: number): boolean {
  const db = getDb();
  const tx = db.transaction((did: number): boolean => {
    const row = db
      .prepare("SELECT user_steam_id AS u, amount_cents AS a, status AS s FROM deposits WHERE id = ?")
      .get(did) as { u: string; a: number; s: DepositStatus } | undefined;
    if (!row || row.s === "paid") return false;
    db.prepare("UPDATE deposits SET status = 'paid', updated_at = datetime('now') WHERE id = ?").run(
      did,
    );
    db.prepare("UPDATE users SET balance_cents = balance_cents + ? WHERE steam_id = ?").run(
      row.a,
      row.u,
    );
    return true;
  });
  return tx(id);
}

export function listDepositsByUser(steamId: string, limit = 50) {
  const rows = getDb()
    .prepare("SELECT * FROM deposits WHERE user_steam_id = ? ORDER BY id DESC LIMIT ?")
    .all(steamId, limit) as DbDeposit[];
  return rows.map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    method: r.method,
    status: r.status,
    createdAt: r.created_at,
  }));
}

// ---- Admin: users overview ---------------------------------------------------

export function listUsersForAdmin(opts: { limit: number; offset: number; search?: string }) {
  const where = opts.search ? "WHERE u.steam_id LIKE @q OR u.name LIKE @q" : "";
  const rows = getDb()
    .prepare(
      `SELECT u.steam_id, u.name, u.avatar, u.balance_cents, u.trade_url, u.created_at,
              (SELECT ip FROM user_events e WHERE e.steam_id = u.steam_id ORDER BY e.id DESC LIMIT 1) AS last_ip,
              (SELECT country FROM user_events e WHERE e.steam_id = u.steam_id AND e.country IS NOT NULL ORDER BY e.id DESC LIMIT 1) AS last_country,
              (SELECT COUNT(*) FROM user_events e WHERE e.steam_id = u.steam_id) AS event_count,
              (SELECT COUNT(*) FROM orders o WHERE o.user_steam_id = u.steam_id) AS order_count
       FROM users u ${where}
       ORDER BY u.created_at DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ q: opts.search ? `%${opts.search}%` : undefined, limit: opts.limit, offset: opts.offset }) as Array<{
    steam_id: string;
    name: string;
    avatar: string;
    balance_cents: number;
    trade_url: string | null;
    created_at: string;
    last_ip: string | null;
    last_country: string | null;
    event_count: number;
    order_count: number;
  }>;
  return rows.map((r) => ({
    steamId: r.steam_id,
    name: r.name,
    avatar: r.avatar,
    balanceCents: r.balance_cents,
    tradeUrl: r.trade_url,
    createdAt: r.created_at,
    lastIp: r.last_ip,
    lastCountry: r.last_country,
    eventCount: r.event_count,
    orderCount: r.order_count,
  }));
}

export function adminStats() {
  const db = getDb();
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    users: n("SELECT COUNT(*) AS n FROM users"),
    orders: n("SELECT COUNT(*) AS n FROM orders"),
    deposits: n("SELECT COUNT(*) AS n FROM deposits"),
    events: n("SELECT COUNT(*) AS n FROM user_events"),
  };
}
