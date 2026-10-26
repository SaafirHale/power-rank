import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { purgeRateLimits, refit } from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * Scheduled refit (see vercel.json). Boards also refit lazily when the last
 * fit is more than ten minutes old, so this is the backstop that keeps the
 * snapshot fresh on quiet days and clears expired rate-limit windows.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const fitId = await refit(db);
  await purgeRateLimits(db);
  return NextResponse.json({ fitId });
}
