import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Order, OrderStatus } from "./types";
import { DEMO_STARTING_BALANCE_CENTS, isSkinsbackLive } from "./config";

// Singleton across hot reloads / route invocations.
const globalForDb = globalThis as unknown as { __bgaDb?: Database.Database };

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
  `);
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__bgaDb) globalForDb.__bgaDb = open();
  return globalForDb.__bgaDb;
}

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
  const startBalance = isSkinsbackLive() ? 0 : DEMO_STARTING_BALANCE_CENTS;
  db.prepare(
    "INSERT INTO users (steam_id, name, avatar, balance_cents) VALUES (?, ?, ?, ?)",
  ).run(steamId, name, avatar, startBalance);
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
    // Opportunistic GC of old nonces.
    db.prepare("DELETE FROM openid_nonces WHERE seen_at < datetime('now', '-1 day')").run();
    return true;
  } catch {
    return false;
  }
}
