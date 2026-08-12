// Env-driven configuration. Everything optional — absent keys degrade to demo mode.

export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function sessionSecret(): string {
  return process.env.SESSION_SECRET || "bgaskins-dev-secret-do-not-use-in-prod";
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
