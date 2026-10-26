import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  LIMITS,
  MATCHUP_TTL_MS,
  MemoryRateLimitStore,
  checkLimits,
  issueMatchupToken,
  issueVisitorToken,
  networkKey,
  verifyMatchupToken,
  verifyVisitorToken,
  voteRules,
} from "../src/lib/abuse";
import { createPgliteDb, prepare, type Db } from "../src/lib/db";
import { castVote, getMatchup } from "../src/lib/service";

const SECRET = "test-secret";
const NOON = Date.UTC(2026, 9, 26, 12, 0, 0);
const DAY = 86_400_000;

describe("visitor cookie", () => {
  it("round-trips and rejects tampering", () => {
    const { id, token } = issueVisitorToken(SECRET);
    expect(verifyVisitorToken(token, SECRET)).toBe(id);
    expect(verifyVisitorToken(token, "other-secret")).toBeNull();
    expect(verifyVisitorToken(`x${token}`, SECRET)).toBeNull();
    expect(verifyVisitorToken(token.slice(0, -1), SECRET)).toBeNull();
    expect(verifyVisitorToken(undefined, SECRET)).toBeNull();
    expect(verifyVisitorToken("no-dot", SECRET)).toBeNull();
  });
});

describe("matchup token", () => {
  it("is bound to the visitor, the pair and a time window", () => {
    const t = issueMatchupToken(3, 7, "vid", NOON, SECRET);
    expect(verifyMatchupToken(t, "vid", NOON + 1000, SECRET)).toEqual({ a: 3, b: 7 });
    expect(verifyMatchupToken(t, "someone-else", NOON, SECRET)).toBeNull();
    expect(verifyMatchupToken(t, "vid", NOON + MATCHUP_TTL_MS + 1, SECRET)).toBeNull();
    expect(verifyMatchupToken(t.replace(/^3\./, "4."), "vid", NOON, SECRET)).toBeNull();
  });

  it("survives a fractional clock reading", () => {
    const t = issueMatchupToken(3, 7, "vid", NOON + 0.5, SECRET);
    expect(verifyMatchupToken(t, "vid", NOON + 1000.25, SECRET)).toEqual({ a: 3, b: 7 });
  });
});

describe("network key", () => {
  it("never contains the IP and rotates every UTC day", () => {
    const today = networkKey("203.0.113.9", NOON, SECRET);
    expect(today).not.toContain("203");
    expect(today).toHaveLength(32);
    expect(networkKey("203.0.113.9", NOON + 3_600_000, SECRET)).toBe(today);
    expect(networkKey("203.0.113.9", NOON + DAY, SECRET)).not.toBe(today);
    expect(networkKey("203.0.113.10", NOON, SECRET)).not.toBe(today);
    expect(networkKey("203.0.113.9", NOON, "other-secret")).not.toBe(today);
  });
});

describe("rate limits", () => {
  it("rejects the request after the limit and resets with the window", async () => {
    const store = new MemoryRateLimitStore();
    const rule = [{ name: "t", key: "k", limit: 3, windowMs: 60_000 }];
    for (let i = 0; i < 3; i++) expect((await checkLimits(store, rule, NOON)).ok).toBe(true);
    const blocked = await checkLimits(store, rule, NOON + 5_000);
    expect(blocked).toEqual({ ok: false, rule: "t", retryAfterMs: 55_000 });
    expect((await checkLimits(store, rule, NOON + 60_000)).ok).toBe(true);
  });

  it("caps one network per minute across many visitors", async () => {
    const store = new MemoryRateLimitStore();
    const net = networkKey("198.51.100.1", NOON, SECRET);
    let allowed = 0;
    // A script clearing its cookie every vote still shares one network key.
    for (let i = 0; i < 100; i++) {
      const r = await checkLimits(store, voteRules(net, `voter-${i}`, `pair-${i}`), NOON);
      if (r.ok) allowed++;
    }
    expect(allowed).toBe(LIMITS.networkPerMinute);
  });

  it("caps the same pair from one network per day", async () => {
    const store = new MemoryRateLimitStore();
    const net = networkKey("198.51.100.2", NOON, SECRET);
    let allowed = 0;
    for (let i = 0; i < 20; i++) {
      // Spread over hours so the per-minute limits never trigger.
      const r = await checkLimits(store, voteRules(net, `voter-${i}`, "1:2"), NOON - 6 * 3_600_000 + i * 600_000);
      if (r.ok) allowed++;
    }
    expect(allowed).toBe(LIMITS.networkPairPerDay);
  });
});

describe("castVote against a real Postgres (PGlite)", () => {
  let db: Db;
  beforeAll(async () => {
    db = await prepare(await createPgliteDb());
  });
  afterAll(() => db.close());

  async function matchup(visitorId: string, now: number) {
    const m = await getMatchup(db, { visitorId, secret: SECRET, scope: "hxh", now });
    if (!m) throw new Error("no matchup");
    return m;
  }

  it("allows one vote per pair per visitor per day, either order", async () => {
    const store = new MemoryRateLimitStore();
    const m = await matchup("alice", NOON);
    const first = await castVote(db, { visitorId: "alice", token: m.token, winnerId: m.left.id, ip: "10.0.0.1", secret: SECRET, now: NOON, store });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.result.winner.delta).toBeGreaterThan(0);
      expect(first.result.loser.delta).toBeLessThan(0);
      expect(first.result.split).toEqual({ winnerVotes: 1, total: 1 });
    }

    // Same token again, and a fresh token for the same pair with the sides swapped.
    const again = await castVote(db, { visitorId: "alice", token: m.token, winnerId: m.right.id, ip: "10.0.0.1", secret: SECRET, now: NOON + 1000, store });
    expect(again).toEqual({ ok: false, error: "duplicate" });
    const swapped = issueMatchupToken(m.right.id, m.left.id, "alice", NOON + 2000, SECRET);
    const again2 = await castVote(db, { visitorId: "alice", token: swapped, winnerId: m.right.id, ip: "10.0.0.1", secret: SECRET, now: NOON + 2000, store });
    expect(again2).toEqual({ ok: false, error: "duplicate" });

    // Another visitor may vote on it, and so may alice tomorrow.
    const bob = issueMatchupToken(m.left.id, m.right.id, "bob", NOON, SECRET);
    expect((await castVote(db, { visitorId: "bob", token: bob, winnerId: m.right.id, ip: "10.0.0.2", secret: SECRET, now: NOON, store })).ok).toBe(true);
    const tomorrow = issueMatchupToken(m.left.id, m.right.id, "alice", NOON + DAY, SECRET);
    expect((await castVote(db, { visitorId: "alice", token: tomorrow, winnerId: m.left.id, ip: "10.0.0.1", secret: SECRET, now: NOON + DAY, store })).ok).toBe(true);

    const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from votes`);
    expect(n).toBe(3);
  });

  it("stops offering a pair once the visitor has voted on it today", async () => {
    const store = new MemoryRateLimitStore();
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      // A minute apart, so the per-minute limit stays out of the way.
      const now = NOON + i * 60_000;
      const m = await matchup("carol", now);
      const key = [m.left.id, m.right.id].sort((a, b) => a - b).join(":");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const r = await castVote(db, { visitorId: "carol", token: m.token, winnerId: m.left.id, ip: "10.1.0.1", secret: SECRET, now, store });
      expect(r.ok).toBe(true);
    }
  });

  it("rejects forged tokens, other visitors' tokens and winners outside the pair", async () => {
    const m = await matchup("dave", NOON);
    const base = { visitorId: "dave", ip: "10.0.0.3", secret: SECRET, now: NOON, store: new MemoryRateLimitStore() };
    expect(await castVote(db, { ...base, token: "1.2.3.forged", winnerId: 1 })).toEqual({ ok: false, error: "bad_token" });
    expect(await castVote(db, { ...base, visitorId: "eve", token: m.token, winnerId: m.left.id })).toEqual({ ok: false, error: "bad_token" });
    expect(await castVote(db, { ...base, token: m.token, winnerId: 99_999 })).toEqual({ ok: false, error: "bad_winner" });
  });

  it("enforces the rate limit through the Postgres-backed store", async () => {
    let limited = 0;
    for (let i = 0; i < LIMITS.visitorPerMinute + 5; i++) {
      const m = await matchup("frank", NOON);
      // Default store is the rate_limits table.
      const r = await castVote(db, { visitorId: "frank", token: m.token, winnerId: m.left.id, ip: `10.2.0.${i}`, secret: SECRET, now: NOON });
      if (!r.ok && r.error === "rate_limited") limited++;
    }
    expect(limited).toBe(5);
    const rows = await db.query<{ key: string }>(`select key from rate_limits`);
    // Stored keys are hashes; no raw address appears anywhere.
    expect(rows.some((r) => r.key.includes("10.2.0"))).toBe(false);
  });
});
