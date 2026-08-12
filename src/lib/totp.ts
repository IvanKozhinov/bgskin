// TOTP (RFC 6238) helpers for admin 2FA, backed by otplib v13 (functional API)
// + qrcode for the enrolment image.

import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { siteUrl } from "./config";

// ±1 time step (~30 s) of tolerance for clock drift.
const EPOCH_TOLERANCE_S = 30;

export function generateTotpSecret(): string {
  return generateSecret();
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    const t = token.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(t)) return false;
    return verifySync({ token: t, secret, epochTolerance: EPOCH_TOLERANCE_S }).valid;
  } catch {
    return false;
  }
}

export function otpauthUrl(username: string, secret: string): string {
  const host = (() => {
    try {
      return new URL(siteUrl()).host;
    } catch {
      return "BGASkins";
    }
  })();
  return generateURI({ issuer: `BGASkins (${host})`, label: username, secret });
}

export async function totpQrDataUrl(username: string, secret: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl(username, secret), {
    margin: 1,
    width: 220,
    color: { dark: "#0a0c10", light: "#ffffff" },
  });
}
