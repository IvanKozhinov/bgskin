// Provider credentials that an admin can set from the panel.
//
// Values live in the `secrets` table encrypted with AES-256-GCM; the key is
// derived from SESSION_SECRET, so a stolen database file alone does not reveal
// them. An env var of the same purpose still works and is used as the fallback,
// which keeps existing deployments running and gives a way back in if the panel
// is ever locked out.
//
// This module deliberately does NOT import ./config: config is imported by db,
// and going the other way would close an import cycle.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { deleteSecretRow, getSecretRow, secretUpdatedAt, setSecretRow } from "./db";

export type SecretName =
  | "skinsback_shop_id"
  | "skinsback_secret"
  | "stripe_secret_key"
  | "stripe_publishable_key"
  | "stripe_webhook_secret"
  | "heleket_merchant_id"
  | "heleket_api_key"
  | "sbp_shop_id"
  | "sbp_secret";

/** Env var consulted when a secret is not set in the panel. */
const ENV_FALLBACK: Record<SecretName, string> = {
  skinsback_shop_id: "SKINSBACK_SHOP_ID",
  skinsback_secret: "SKINSBACK_SECRET",
  stripe_secret_key: "STRIPE_SECRET_KEY",
  stripe_publishable_key: "STRIPE_PUBLISHABLE_KEY",
  stripe_webhook_secret: "STRIPE_WEBHOOK_SECRET",
  heleket_merchant_id: "HELEKET_MERCHANT_ID",
  heleket_api_key: "HELEKET_API_KEY",
  sbp_shop_id: "SBP_SHOP_ID",
  sbp_secret: "SBP_SECRET",
};

function encryptionKey(): Buffer {
  const base =
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === "production" ? "" : "bgaskins-dev-secret-do-not-use-in-prod");
  if (!base) {
    throw new Error("SESSION_SECRET is required to store provider credentials.");
  }
  return scryptSync(base, "bgaskins-secrets-v1", 32);
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(
    ".",
  );
}

function decrypt(stored: string): string | null {
  const parts = stored.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key (SESSION_SECRET changed) or tampered row.
    return null;
  }
}

/** Panel value first, env second, null when neither is set. */
export function getSetting(name: SecretName): string | null {
  try {
    const row = getSecretRow(name);
    if (row) {
      const value = decrypt(row);
      if (value) return value;
      console.warn(`[settings] cannot decrypt "${name}" — has SESSION_SECRET changed?`);
    }
  } catch (err) {
    console.warn(`[settings] read failed for "${name}":`, err);
  }
  return process.env[ENV_FALLBACK[name]] || null;
}

export function setSetting(name: SecretName, value: string | null): void {
  if (value === null || value.trim() === "") {
    deleteSecretRow(name);
    return;
  }
  setSecretRow(name, encrypt(value.trim()));
}

export interface SettingStatus {
  name: SecretName;
  set: boolean;
  source: "panel" | "env" | "none";
  hint: string; // masked preview, e.g. "sk_live_…7f3a"
  updatedAt: string | null;
}

function mask(value: string): string {
  if (value.length <= 4) return "••••";
  if (value.length <= 10) return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function settingStatus(name: SecretName): SettingStatus {
  let panelValue: string | null = null;
  try {
    const row = getSecretRow(name);
    panelValue = row ? decrypt(row) : null;
  } catch {
    panelValue = null;
  }
  const envValue = process.env[ENV_FALLBACK[name]] || null;
  const effective = panelValue ?? envValue;
  return {
    name,
    set: Boolean(effective),
    source: panelValue ? "panel" : envValue ? "env" : "none",
    hint: effective ? mask(effective) : "",
    updatedAt: panelValue ? secretUpdatedAt(name) : null,
  };
}

// ---- Typed accessors used across the app ------------------------------------

export const skinsbackShopId = (): string | null => getSetting("skinsback_shop_id");
export const skinsbackSecret = (): string | null => getSetting("skinsback_secret");

/** Skinsback configured = real prices + real item withdrawal available. */
export function isSkinsbackLive(): boolean {
  return Boolean(skinsbackShopId() && skinsbackSecret());
}

export const stripeSecretKey = (): string | null => getSetting("stripe_secret_key");
export const stripePublishableKey = (): string | null => getSetting("stripe_publishable_key");
export const stripeWebhookSecret = (): string | null => getSetting("stripe_webhook_secret");
export const isStripeConfigured = (): boolean => Boolean(stripeSecretKey());

export const heleketMerchantId = (): string | null => getSetting("heleket_merchant_id");
export const heleketApiKey = (): string | null => getSetting("heleket_api_key");
export const isHeleketConfigured = (): boolean =>
  Boolean(heleketMerchantId() && heleketApiKey());

export const sbpShopId = (): string | null => getSetting("sbp_shop_id");
export const sbpSecret = (): string | null => getSetting("sbp_secret");
export const isSbpConfigured = (): boolean => Boolean(sbpShopId() && sbpSecret());

/**
 * Drop cached provider data so new credentials take effect immediately instead
 * of after the price/catalog TTL.
 */
export function invalidateProviderCaches(): void {
  const g = globalThis as typeof globalThis & {
    __bgaPrices?: unknown;
    __bgaCatalogStore?: unknown;
  };
  delete g.__bgaPrices;
  delete g.__bgaCatalogStore;
}
