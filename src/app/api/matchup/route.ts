import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE, issueVisitorToken, verifyVisitorToken } from "@/lib/abuse";
import { getDb } from "@/lib/db";
import { secret } from "@/lib/env";
import { getMatchup, listSeries } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = secret();
  let visitorId = verifyVisitorToken(req.cookies.get(VISITOR_COOKIE)?.value, key);
  let newCookie: string | null = null;
  if (!visitorId) {
    const v = issueVisitorToken(key);
    visitorId = v.id;
    newCookie = v.token;
  }

  const db = await getDb();
  const requested = req.nextUrl.searchParams.get("scope") ?? "all";
  const known = (await listSeries(db)).some((s) => s.slug === requested);
  const scope = known ? requested : "all";
  const m = await getMatchup(db, { visitorId, secret: key, scope });

  const res = NextResponse.json(m ? { scope, ...m } : { scope, done: true }, {
    headers: { "Cache-Control": "no-store" },
  });
  if (newCookie) {
    res.cookies.set(VISITOR_COOKIE, newCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
