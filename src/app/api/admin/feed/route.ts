import { isAdminAuthed } from "@/lib/admin";
import { DEFAULT_FEED_CONFIG, getFeedConfig, setFeedConfig } from "@/lib/feedcfg";
import type { FeedConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Keys of FeedConfig whose values are plain numbers (validated/clamped in lib). */
const NUMBER_KEYS = [
  "minIntervalMs",
  "maxIntervalMs",
  "backlogSize",
  "ringSize",
  "cheapBias",
  "cheapThresholdCents",
  "minPriceCents",
  "maxPriceCents",
] as const;

/** Build a defensively-typed patch from an untrusted request body. */
function buildPatch(body: unknown): Partial<FeedConfig> {
  const patch: Partial<FeedConfig> = {};
  if (typeof body !== "object" || body === null) return patch;
  const b = body as Record<string, unknown>;

  if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
  if (typeof b.maskNicks === "boolean") patch.maskNicks = b.maskNicks;

  for (const key of NUMBER_KEYS) {
    const v = b[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      patch[key] = v;
    }
  }

  if (typeof b.nicks === "string") {
    patch.nicks = b.nicks
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
  } else if (Array.isArray(b.nicks)) {
    patch.nicks = b.nicks
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
  }

  return patch;
}

export async function GET(request: Request): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("defaults") === "1") {
    return Response.json(DEFAULT_FEED_CONFIG);
  }
  return Response.json(getFeedConfig());
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdminAuthed())) {
    return Response.json({ ok: false, error: "Доступ запрещён" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "Некорректное тело запроса" },
      { status: 400 },
    );
  }

  const config = setFeedConfig(buildPatch(body));
  return Response.json(config);
}
