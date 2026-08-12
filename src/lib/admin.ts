// Admin authentication: password (scrypt, seeded from env) + optional TOTP 2FA.
// Session lives in a separate httpOnly cookie from the user session.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret } from "./config";
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

/** Fully authenticated = valid session AND (2FA passed OR 2FA not enabled). */
export async function isAdminAuthed(): Promise<boolean> {
  const s = await getAdminSession();
  if (!s) return false;
  const admin = getAdmin();
  if (admin?.totp_enabled === 1) return s.mfa === true;
  return true;
}
