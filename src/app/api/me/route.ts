import { isSkinsbackLive } from "@/lib/config";
import { getSessionUser } from "@/lib/session";
import type { MeResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({
    user: await getSessionUser(),
    demo: !isSkinsbackLive(),
  } satisfies MeResponse);
}
