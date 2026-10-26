import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Anti-abuse without accounts and without storing IP addresses.
 *
 * - Visitors get a random id in a cookie, signed with HMAC so it cannot be
 *   forged. The database only ever sees an HMAC of that id.
 * - Each matchup is handed out as a signed token bound to the visitor, so a
 *   script cannot vote on pairs of its choosing.
 * - Rate limits key on the client IP, but only as HMAC(daily salt, ip). The
 *   salt is derived from the server secret and the UTC date, so keys rotate
 *   at midnight and yesterday's keys cannot be linked to today's.
 */

const b64url = (buf: Buffer) => buf.toString("base64url");

function mac(secret: string, data: string): string {
  return b64url(createHmac("sha256", secret).update(data).digest());
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// ---- visitor cookie ------------------------------------------------------

export const VISITOR_COOKIE = "pr_vid";

export function issueVisitorToken(secret: string): { id: string; token: string } {
  const id = b64url(randomBytes(16));
  return { id, token: `${id}.${mac(secret, `vid:${id}`)}` };
}

/** Returns the visitor id, or null if the token is missing or tampered with. */
export function verifyVisitorToken(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  return safeEqual(token.slice(dot + 1), mac(secret, `vid:${id}`)) ? id : null;
}

/** What the votes table stores instead of the visitor id. */
export function voterHash(visitorId: string, secret: string): string {
  return mac(secret, `voter:${visitorId}`);
}

// ---- matchup tokens ------------------------------------------------------

export const MATCHUP_TTL_MS = 30 * 60 * 1000;

export function issueMatchupToken(a: number, b: number, visitorId: string, now: number, secret: string): string {
  const body = `${a}.${b}.${now}`;
  return `${body}.${mac(secret, `match:${visitorId}:${body}`)}`;
}

export function verifyMatchupToken(
  token: string,
  visitorId: string,
  now: number,
  secret: string,
): { a: number; b: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [a, b, iat, sig] = parts;
  if (!safeEqual(sig, mac(secret, `match:${visitorId}:${a}.${b}.${iat}`))) return null;
  const issued = Number(iat);
  if (!Number.isFinite(issued) || now - issued > MATCHUP_TTL_MS || issued - now > 60_000) return null;
  return { a: Number(a), b: Number(b) };
}

// ---- rate limiting -------------------------------------------------------

/** HMAC(daily salt, ip). Never reversible to the IP, and rotates each UTC day. */
export function networkKey(ip: string, now: number, secret: string): string {
  const salt = mac(secret, `rl-salt:${utcDay(now)}`);
  return mac(salt, ip).slice(0, 32);
}

export interface RateLimitStore {
  /** Increment the counter for (key, window) and return the new count. */
  hit(key: string, windowStart: number): Promise<number>;
}

export type Rule = { name: string; key: string; limit: number; windowMs: number };

export type LimitResult = { ok: true } | { ok: false; rule: string; retryAfterMs: number };

export async function checkLimits(store: RateLimitStore, rules: Rule[], now: number): Promise<LimitResult> {
  for (const r of rules) {
    const windowStart = Math.floor(now / r.windowMs) * r.windowMs;
    const count = await store.hit(`${r.name}:${r.key}`, windowStart);
    if (count > r.limit) return { ok: false, rule: r.name, retryAfterMs: windowStart + r.windowMs - now };
  }
  return { ok: true };
}

export const LIMITS = {
  networkPerMinute: 30,
  networkPerDay: 1500,
  visitorPerMinute: 20,
  /** Same pair from the same network per day; above 1 so shared networks still work. */
  networkPairPerDay: 5,
};

/** Every limit that applies to one vote attempt. */
export function voteRules(netKey: string, voter: string, pair: string): Rule[] {
  const MIN = 60_000;
  const DAY = 86_400_000;
  return [
    { name: "net-min", key: netKey, limit: LIMITS.networkPerMinute, windowMs: MIN },
    { name: "net-day", key: netKey, limit: LIMITS.networkPerDay, windowMs: DAY },
    { name: "voter-min", key: voter, limit: LIMITS.visitorPerMinute, windowMs: MIN },
    { name: "net-pair", key: `${netKey}:${pair}`, limit: LIMITS.networkPairPerDay, windowMs: DAY },
  ];
}

export class MemoryRateLimitStore implements RateLimitStore {
  counts = new Map<string, number>();
  async hit(key: string, windowStart: number) {
    const k = `${key}@${windowStart}`;
    const n = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, n);
    return n;
  }
}
