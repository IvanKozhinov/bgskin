// Env-driven configuration. Everything optional — absent keys degrade to demo mode.

export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length > 0) return s;
  // Fail closed in production: never sign/verify sessions with the public,
  // repo-committed dev key — a forgotten env var would otherwise be a full
  // account-takeover hole (anyone could mint a session for any SteamID).
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is required in production. Set it to a long random string in the environment.",
    );
  }
  return "bgaskins-dev-secret-do-not-use-in-prod";
}

export function steamApiKey(): string | null {
  return process.env.STEAM_API_KEY || null;
}

export function skinsbackShopId(): string | null {
  return process.env.SKINSBACK_SHOP_ID || null;
}

export function skinsbackSecret(): string | null {
  return process.env.SKINSBACK_SECRET || null;
}

/** Live mode = real Skinsback prices + real withdrawals. */
export function isSkinsbackLive(): boolean {
  return Boolean(skinsbackShopId() && skinsbackSecret());
}

export function openrouterKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

/** Starting balance for new users in demo mode, cents. */
export const DEMO_STARTING_BALANCE_CENTS = 10_000;
