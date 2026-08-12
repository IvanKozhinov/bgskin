import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/config";
import { getUser, upsertUser } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { createSession } from "@/lib/session";
import { fetchSteamProfile, verifySteamCallback } from "@/lib/steam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const steamId = await verifySteamCallback(searchParams);
  if (!steamId) {
    return NextResponse.redirect(`${siteUrl()}/?auth=failed`, 302);
  }

  const profile = await fetchSteamProfile(steamId);
  // A failed profile fetch returns a placeholder (empty avatar). On re-login,
  // don't overwrite an already-good stored name/avatar with that placeholder.
  const existing = getUser(steamId);
  const name = profile.avatar ? profile.name : existing?.name || profile.name;
  const avatar = profile.avatar || existing?.avatar || "";
  upsertUser(steamId, name, avatar);
  // createSession sets the httpOnly cookie via cookies(), which is writable
  // inside route handlers; the cookie rides along with the redirect response.
  await createSession(steamId);
  await logEvent(request, { steamId, type: "login" });

  return NextResponse.redirect(`${siteUrl()}/`, 302);
}
