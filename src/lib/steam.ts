// Steam OpenID 2.0 authentication + profile enrichment.
// No external deps: OpenID verification is a single form POST, profile
// fetching uses the Web API when a key is present or the public XML
// endpoint otherwise.

import { siteUrl, steamApiKey } from "./config";
import { consumeNonce } from "./db";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";

const CLAIMED_ID_RE = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** Build the Steam OpenID login redirect URL. */
export function steamLoginUrl(): string {
  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.claimed_id": IDENTIFIER_SELECT,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.return_to": `${siteUrl()}/api/auth/steam/return`,
    "openid.realm": `${siteUrl()}/`,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

/**
 * Verify a Steam OpenID callback. Returns the SteamID64 on success, null on
 * any failure (bad mode, foreign return_to, failed check_authentication,
 * malformed claimed_id, or replayed nonce).
 */
export async function verifySteamCallback(
  searchParams: URLSearchParams,
): Promise<string | null> {
  if (searchParams.get("openid.mode") !== "id_res") return null;

  const returnTo = searchParams.get("openid.return_to") ?? "";
  if (!returnTo.startsWith(`${siteUrl()}/api/auth/steam/return`)) return null;

  // Echo every openid.* param back to Steam, switching mode to
  // check_authentication (direct verification per OpenID 2.0 §11.4.2).
  const body = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key.startsWith("openid.")) body.append(key, value);
  });
  body.set("openid.mode", "check_authentication");

  try {
    const res = await fetch(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!/is_valid\s*:\s*true/.test(text)) return null;
  } catch {
    return null;
  }

  const claimedId = searchParams.get("openid.claimed_id") ?? "";
  const match = CLAIMED_ID_RE.exec(claimedId);
  if (!match) return null;

  // Replay protection: each response_nonce may be consumed exactly once.
  const nonce = searchParams.get("openid.response_nonce");
  if (!nonce || !consumeNonce(nonce)) return null;

  return match[1];
}

/**
 * Fetch display name + avatar for a SteamID64. Uses the official Web API
 * when STEAM_API_KEY is configured, otherwise the keyless profile XML
 * endpoint. Never throws — degrades to a generic placeholder profile.
 */
export async function fetchSteamProfile(
  steamId: string,
): Promise<{ name: string; avatar: string }> {
  const fallback = { name: `Player ${steamId.slice(-4)}`, avatar: "" };
  const key = steamApiKey();

  try {
    if (key) {
      const url =
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/" +
        `?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(steamId)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return fallback;
      const data = (await res.json()) as {
        response?: { players?: { personaname?: string; avatarfull?: string }[] };
      };
      const player = data.response?.players?.[0];
      if (!player) return fallback;
      return {
        name: player.personaname || fallback.name,
        avatar: player.avatarfull || "",
      };
    }

    // Keyless fallback: public community profile XML.
    const res = await fetch(
      `https://steamcommunity.com/profiles/${encodeURIComponent(steamId)}/?xml=1`,
      { cache: "no-store" },
    );
    if (!res.ok) return fallback;
    const xml = await res.text();
    const nameMatch = /<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/.exec(xml);
    const avatarMatch = /<avatarFull><!\[CDATA\[([\s\S]*?)\]\]><\/avatarFull>/.exec(xml);
    const name = nameMatch?.[1]?.trim();
    const avatar = avatarMatch?.[1]?.trim();
    return { name: name || fallback.name, avatar: avatar || "" };
  } catch {
    return fallback;
  }
}
