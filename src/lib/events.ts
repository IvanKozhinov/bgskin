// Audit logging of user actions with IP + country. Never throws — logging must
// not break the request it observes.

import { insertEvent } from "./db";
import { clientIp, resolveCountry } from "./geo";

export async function logEvent(
  req: Request,
  e: {
    steamId?: string | null;
    type: string;
    path?: string | null;
    meta?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    const ip = clientIp(req.headers);
    const { country, countryName } = await resolveCountry(req.headers, ip);
    insertEvent({
      steamId: e.steamId ?? null,
      type: e.type,
      ip,
      country,
      countryName,
      path: e.path ?? null,
      meta: e.meta ?? null,
    });
  } catch {
    // swallow — auditing is best-effort
  }
}
