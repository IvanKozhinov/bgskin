import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret } from "./config";
import { getUser } from "./db";
import type { SessionUser } from "./types";

const COOKIE = "bga_session";
const MAX_AGE_S = 30 * 24 * 3600;

function key(): Uint8Array {
  return new TextEncoder().encode(sessionSecret());
}

export async function createSession(steamId: string): Promise<void> {
  const token = await new SignJWT({ sid: steamId })
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

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** SteamID64 of the logged-in user, or null. */
export async function getSessionSteamId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

/** Full session user (fresh from DB), or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const steamId = await getSessionSteamId();
  if (!steamId) return null;
  const u = getUser(steamId);
  if (!u) return null;
  return {
    steamId: u.steam_id,
    name: u.name,
    avatar: u.avatar,
    tradeUrl: u.trade_url,
    balanceCents: u.balance_cents,
  };
}
