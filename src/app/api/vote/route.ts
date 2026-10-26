import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE, verifyVisitorToken } from "@/lib/abuse";
import { getDb } from "@/lib/db";
import { clientIp, secret } from "@/lib/env";
import { castVote } from "@/lib/service";

export const dynamic = "force-dynamic";

const STATUS = { bad_token: 400, bad_winner: 400, duplicate: 409, rate_limited: 429 } as const;

export async function POST(req: NextRequest) {
  const key = secret();
  const visitorId = verifyVisitorToken(req.cookies.get(VISITOR_COOKIE)?.value, key);
  if (!visitorId) return NextResponse.json({ error: "no_cookie" }, { status: 401 });

  let body: { token?: unknown; winnerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.token !== "string" || typeof body.winnerId !== "number") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const db = await getDb();
  const out = await castVote(db, {
    visitorId,
    token: body.token,
    winnerId: body.winnerId,
    ip: clientIp(req.headers),
    secret: key,
  });
  if (!out.ok) {
    const headers: Record<string, string> = {};
    if (out.retryAfterMs) headers["Retry-After"] = String(Math.ceil(out.retryAfterMs / 1000));
    return NextResponse.json({ error: out.error }, { status: STATUS[out.error], headers });
  }
  return NextResponse.json(out.result);
}
