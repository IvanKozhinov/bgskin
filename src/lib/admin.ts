// Admin authentication: password (scrypt, seeded from env) + optional TOTP 2FA.
// Session lives in a separate httpOnly cookie from the user session.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { adminRequire2fa, sessionSecret } from "./config";
import { getAdmin, verifyScrypt } from "./db";
import { verifyTotp } from "./totp";

const COOKIE = "bga_admin";
const MAX_AGE_S = 12 * 3600;

function key(): Uint8Array {
  return new TextEncoder().encode(sessionSecret() + "::admin");
}

export interface AdminSession {
  username: string;
  mfa: boolean; // whether 2FA was satisfied this session
}

/** Verify username+password. Returns whether TOTP is required to finish login. */
export function checkAdminPassword(
  username: string,
  password: string,
): { ok: boolean; totpRequired: boolean } {
  const admin = getAdmin();
  if (!admin) return { ok: false, totpRequired: false };
  if (username !== admin.username) return { ok: false, totpRequired: false };
  if (!verifyScrypt(password, admin.password_hash)) return { ok: false, totpRequired: false };
  return { ok: true, totpRequired: admin.totp_enabled === 1 };
}

export function checkAdminTotp(token: string): boolean {
  const admin = getAdmin();
  if (!admin || !admin.totp_secret) return false;
  return verifyTotp(token, admin.totp_secret);
}

export async function createAdminSession(username: string, mfa: boolean): Promise<void> {
  const token = await new SignJWT({ role: "admin", u: username, mfa })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(key());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_S,
    path: "/",
  });
}

export async function clearAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Raw session (may be pre-2FA). Use isAdminAuthed for access decisions. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.role !== "admin" || typeof payload.u !== "string") return null;
    return { username: payload.u, mfa: payload.mfa === true };
  } catch {
    return null;
  }
}

/** True when a (possibly pre-2FA) admin session cookie is present and valid. */
export async function hasAdminSession(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

/**
 * Enrollment is required when the deployment mandates 2FA (ADMIN_REQUIRE_2FA=1)
 * but this admin has not enabled TOTP yet. Such a session may only reach the
 * 2FA setup flow, not the rest of the panel.
 */
export async function adminNeedsEnrollment(): Promise<boolean> {
  if (!adminRequire2fa()) return false;
  if (!(await hasAdminSession())) return false;
  return getAdmin()?.totp_enabled !== 1;
}

/**
 * Fully authenticated = valid session AND second factor satisfied:
 *  - if TOTP is enabled, the session must carry mfa=true;
 *  - if ADMIN_REQUIRE_2FA is set but TOTP not yet enabled, access is denied
 *    (the admin must enrol first);
 *  - otherwise a valid session is enough.
 */
export async function isAdminAuthed(): Promise<boolean> {
  const s = await getAdminSession();
  if (!s) return false;
  const admin = getAdmin();
  if (admin?.totp_enabled === 1) return s.mfa === true;
  if (adminRequire2fa()) return false; // must enrol before access
  return true;
}

// ---- Brute-force throttle (per-process, best-effort) -------------------------

interface Attempts {
  count: number;
  resetAt: number;
}
const g = globalThis as typeof globalThis & { __bgaAdminThrottle?: Map<string, Attempts> };
function throttleMap(): Map<string, Attempts> {
  if (!g.__bgaAdminThrottle) g.__bgaAdminThrottle = new Map();
  return g.__bgaAdminThrottle;
}

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;

/** Returns true if the key is allowed to attempt now (and records the attempt). */
export function rateLimitAttempt(key: string): boolean {
  const m = throttleMap();
  const now = Date.now();
  const cur = m.get(key);
  if (!cur || now > cur.resetAt) {
    m.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (cur.count >= MAX_ATTEMPTS) return false;
  cur.count += 1;
  return true;
}

/** Clear the throttle for a key after a successful auth. */
export function rateLimitReset(key: string): void {
  throttleMap().delete(key);
}
