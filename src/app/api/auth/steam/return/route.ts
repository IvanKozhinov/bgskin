import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/config";
import { upsertUser } from "@/lib/db";
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
  upsertUser(steamId, profile.name, profile.avatar);
  // createSession sets the httpOnly cookie via cookies(), which is writable
  // inside route handlers; the cookie rides along with the redirect response.
  await createSession(steamId);

  return NextResponse.redirect(`${siteUrl()}/`, 302);
}
