// Env-driven configuration. Payment/withdrawal providers activate when their
// keys are present; without them the app runs as a storefront that collects
// deposits/orders in a pending state (no fake money, no fake delivery).

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

// ---- Skinsback (price list + item withdrawal) --------------------------------

export function skinsbackShopId(): string | null {
  return process.env.SKINSBACK_SHOP_ID || null;
}

export function skinsbackSecret(): string | null {
  return process.env.SKINSBACK_SECRET || null;
}

/** Skinsback configured = real prices + real item withdrawal available. */
export function isSkinsbackLive(): boolean {
  return Boolean(skinsbackShopId() && skinsbackSecret());
}

// ---- Admin panel -------------------------------------------------------------

export function adminUser(): string {
  return process.env.ADMIN_USER || "admin";
}

/** Plaintext admin password from env (hashed at rest on first boot). */
export function adminPasswordEnv(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

/** When false, 2FA is optional; admins are prompted to enable it. */
export function adminRequire2fa(): boolean {
  return process.env.ADMIN_REQUIRE_2FA === "1";
}

// ---- Payment providers (deposits) --------------------------------------------

export function stripeSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY || null;
}
export function stripePublishableKey(): string | null {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}
export function isStripeConfigured(): boolean {
  return Boolean(stripeSecretKey());
}

export function heleketMerchantId(): string | null {
  return process.env.HELEKET_MERCHANT_ID || null;
}
export function heleketApiKey(): string | null {
  return process.env.HELEKET_API_KEY || null;
}
export function isHeleketConfigured(): boolean {
  return Boolean(heleketMerchantId() && heleketApiKey());
}

/** СБП / card acquiring (e.g. YooKassa, Tinkoff) shop credentials. */
export function sbpShopId(): string | null {
  return process.env.SBP_SHOP_ID || null;
}
export function sbpSecret(): string | null {
  return process.env.SBP_SECRET || null;
}
export function isSbpConfigured(): boolean {
  return Boolean(sbpShopId() && sbpSecret());
}

export function openrouterKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}
