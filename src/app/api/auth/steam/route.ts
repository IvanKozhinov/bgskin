import { NextResponse } from "next/server";
import { steamLoginUrl } from "@/lib/steam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return NextResponse.redirect(steamLoginUrl(), 302);
}
