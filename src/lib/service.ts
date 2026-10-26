import {
  checkLimits,
  issueMatchupToken,
  networkKey,
  utcDay,
  verifyMatchupToken,
  voteRules,
  voterHash,
  type RateLimitStore,
} from "./abuse";
import { fitBradleyTerry, toRating, RATING_SCALE, type PairCount } from "./bradley-terry";
import type { Db, Queryable } from "./db";
import { eloUpdate } from "./elo";
import { pairKey, pickPair, type Candidate } from "./matchmaking";

/** Real (non-virtual) matchups a character needs before it gets a rank. */
export const MIN_GAMES = 15;
/** Boards refit at most this often, and only if there are new votes. */
export const REFIT_MS = 10 * 60 * 1000;
/** Pairs need this many votes to appear on the controversial page. */
export const CONTROVERSIAL_MIN_VOTES = 10;
/** Standard error used for a character the latest fit has not seen yet. */
const UNSEEN_SE = Math.SQRT2;

export type Character = {
  id: number;
  slug: string;
  name: string;
  form: string | null;
  series: string;
  seriesName: string;
  color: string;
  elo: number;
  eloGames: number;
};

const CHARACTER_COLUMNS = `c.id, c.slug, c.name, c.form, c.series, s.name as "seriesName", s.color,
  c.elo, c.elo_games as "eloGames"`;

export async function listSeries(db: Queryable) {
  return db.query<{ slug: string; name: string; color: string }>(`select slug, name, color from series order by sort`);
}

// ---- fitting -------------------------------------------------------------

export async function refit(db: Db): Promise<number> {
  const chars = await db.query<{ id: number }>(`select id from characters where active order by id`);
  const index = new Map(chars.map((c, i) => [c.id, i]));
  const rows = await db.query<{ a_id: number; b_id: number; n: number; a_wins: number }>(
    `select a_id, b_id, count(*)::int as n, (count(*) filter (where winner_id = a_id))::int as a_wins
     from votes group by a_id, b_id`,
  );
  const pairs: PairCount[] = [];
  let nVotes = 0;
  for (const r of rows) {
    const a = index.get(r.a_id);
    const b = index.get(r.b_id);
    if (a === undefined || b === undefined) continue;
    pairs.push({ a, b, aWins: r.a_wins, bWins: r.n - r.a_wins });
    nVotes += r.n;
  }
  const fit = fitBradleyTerry(chars.length, pairs);

  return db.tx(async (q) => {
    const [{ id }] = await q.query<{ id: number }>(
      `insert into fits (n_votes, n_characters, iterations, converged) values ($1, $2, $3, $4) returning id`,
      [nVotes, chars.length, fit.iterations, fit.converged],
    );
    await q.query(
      `insert into ratings (fit_id, character_id, theta, se, wins, losses)
       select $1::int, * from unnest($2::int[], $3::float8[], $4::float8[], $5::int[], $6::int[])`,
      [id, chars.map((c) => c.id), fit.theta, fit.se, fit.wins, fit.losses],
    );
    // Keep a short history; the boards only read the latest.
    await q.query(`delete from fits where id < $1 - 4`, [id]);
    return id;
  });
}

type FitRow = { id: number; fitted_at: Date | string; n_votes: number; n_characters: number };

export async function latestFit(db: Queryable): Promise<FitRow | null> {
  const [f] = await db.query<FitRow>(`select id, fitted_at, n_votes, n_characters from fits order by id desc limit 1`);
  return f ?? null;
}

/** Return a fit that is at most REFIT_MS stale, refitting if needed. */
export async function ensureFreshFit(db: Db, now = Date.now()): Promise<FitRow> {
  const f = await latestFit(db);
  const [{ votes, chars }] = await db.query<{ votes: number; chars: number }>(
    `select (select count(*) from votes)::int as votes, (select count(*) from characters where active)::int as chars`,
  );
  const stale =
    !f || f.n_characters !== chars || (f.n_votes !== votes && now - new Date(f.fitted_at).getTime() > REFIT_MS);
  if (stale) await refit(db);
  return (await latestFit(db))!;
}

// ---- boards --------------------------------------------------------------

export type BoardRow = Character & {
  rank: number | null;
  rating: number;
  /** Half-width of the 95% interval, in rating points. */
  ci: number;
  wins: number;
  losses: number;
  games: number;
};

export async function getBoard(db: Db, series: string | null) {
  const fit = await ensureFreshFit(db);
  const rows = await db.query<Character & { theta: number | null; se: number | null; wins: number | null; losses: number | null }>(
    `select ${CHARACTER_COLUMNS}, r.theta, r.se, r.wins, r.losses
     from characters c join series s on s.slug = c.series
     left join ratings r on r.character_id = c.id and r.fit_id = $1
     where c.active and ($2::text is null or c.series = $2)`,
    [fit.id, series],
  );
  const all: BoardRow[] = rows.map(({ theta, se, wins, losses, ...c }) => ({
    ...c,
    rank: null,
    rating: toRating(theta ?? 0),
    ci: 1.96 * (se ?? UNSEEN_SE) * RATING_SCALE,
    wins: wins ?? 0,
    losses: losses ?? 0,
    games: (wins ?? 0) + (losses ?? 0),
  }));
  const ranked = all.filter((r) => r.games >= MIN_GAMES).sort((a, b) => b.rating - a.rating);
  ranked.forEach((r, i) => (r.rank = i + 1));
  const provisional = all
    .filter((r) => r.games < MIN_GAMES)
    .sort((a, b) => b.games - a.games || b.rating - a.rating);
  return { ranked, provisional, fittedAt: new Date(fit.fitted_at), nVotes: fit.n_votes };
}

// ---- matchmaking ---------------------------------------------------------

export async function getMatchup(
  db: Db,
  opts: { visitorId: string; secret: string; scope: string; now?: number; rng?: () => number },
) {
  const now = opts.now ?? Date.now();
  const fit = await latestFit(db);
  const scope = opts.scope === "all" ? null : opts.scope;
  const chars = await db.query<Character & { theta: number | null; se: number | null }>(
    `select ${CHARACTER_COLUMNS}, r.theta, r.se
     from characters c join series s on s.slug = c.series
     left join ratings r on r.character_id = c.id and r.fit_id = $1
     where c.active and ($2::text is null or c.series = $2)`,
    [fit?.id ?? -1, scope],
  );
  const voter = voterHash(opts.visitorId, opts.secret);
  const seen = await db.query<{ a_id: number; b_id: number }>(
    `select a_id, b_id from votes where voter = $1 and day = $2`,
    [voter, utcDay(now)],
  );
  const byId = new Map(chars.map((c) => [c.id, c]));
  const cands: Candidate[] = chars.map((c) => ({
    id: c.id,
    series: c.series,
    theta: c.theta ?? 0,
    se: c.se ?? UNSEEN_SE,
  }));
  const pair = pickPair(cands, { exclude: new Set(seen.map((s) => pairKey(s.a_id, s.b_id))), rng: opts.rng });
  if (!pair) return null;
  const strip = ({ theta: _t, se: _s, ...c }: Character & { theta: unknown; se: unknown }): Character => c;
  const [left, right] = pair.map((p) => strip(byId.get(p.id)!));
  return { left, right, token: issueMatchupToken(left.id, right.id, opts.visitorId, now, opts.secret) };
}

// ---- voting --------------------------------------------------------------

export class PgRateLimitStore implements RateLimitStore {
  constructor(private db: Queryable) {}
  async hit(key: string, windowStart: number) {
    const [row] = await this.db.query<{ count: number }>(
      `insert into rate_limits (key, window_start, count) values ($1, $2, 1)
       on conflict (key, window_start) do update set count = rate_limits.count + 1
       returning count`,
      [key, new Date(windowStart).toISOString()],
    );
    return row.count;
  }
}

export type VoteError = "bad_token" | "bad_winner" | "rate_limited" | "duplicate";

export type VoteResult = {
  winner: { id: number; elo: number; delta: number };
  loser: { id: number; elo: number; delta: number };
  /** All-time crowd split on this pair, including this vote. */
  split: { winnerVotes: number; total: number };
};

export async function castVote(
  db: Db,
  input: {
    visitorId: string;
    token: string;
    winnerId: number;
    ip: string;
    secret: string;
    now?: number;
    store?: RateLimitStore;
  },
): Promise<{ ok: true; result: VoteResult } | { ok: false; error: VoteError; retryAfterMs?: number }> {
  const now = input.now ?? Date.now();
  const m = verifyMatchupToken(input.token, input.visitorId, now, input.secret);
  if (!m) return { ok: false, error: "bad_token" };
  if (input.winnerId !== m.a && input.winnerId !== m.b) return { ok: false, error: "bad_winner" };
  const loserId = input.winnerId === m.a ? m.b : m.a;
  const [lo, hi] = m.a < m.b ? [m.a, m.b] : [m.b, m.a];

  const voter = voterHash(input.visitorId, input.secret);
  const limit = await checkLimits(
    input.store ?? new PgRateLimitStore(db),
    voteRules(networkKey(input.ip, now, input.secret), voter, pairKey(lo, hi)),
    now,
  );
  if (!limit.ok) return { ok: false, error: "rate_limited", retryAfterMs: limit.retryAfterMs };

  const result = await db.tx(async (q) => {
    const inserted = await q.query(
      `insert into votes (a_id, b_id, winner_id, voter, day) values ($1, $2, $3, $4, $5)
       on conflict (voter, a_id, b_id, day) do nothing returning id`,
      [lo, hi, input.winnerId, voter, utcDay(now)],
    );
    if (inserted.length === 0) return null;
    // Lock both rows in id order so concurrent votes cannot deadlock.
    const rows = await q.query<{ id: number; elo: number; elo_games: number }>(
      `select id, elo, elo_games from characters where id = any($1::int[]) order by id for update`,
      [[lo, hi]],
    );
    const w = rows.find((r) => r.id === input.winnerId)!;
    const l = rows.find((r) => r.id === loserId)!;
    const next = eloUpdate({ elo: w.elo, games: w.elo_games }, { elo: l.elo, games: l.elo_games });
    await q.query(`update characters set elo = $2, elo_games = elo_games + 1 where id = $1`, [w.id, next.winner]);
    await q.query(`update characters set elo = $2, elo_games = elo_games + 1 where id = $1`, [l.id, next.loser]);
    const [split] = await q.query<{ total: number; winner_votes: number }>(
      `select count(*)::int as total, (count(*) filter (where winner_id = $3))::int as winner_votes
       from votes where a_id = $1 and b_id = $2`,
      [lo, hi, input.winnerId],
    );
    return {
      winner: { id: w.id, elo: next.winner, delta: next.winner - w.elo },
      loser: { id: l.id, elo: next.loser, delta: next.loser - l.elo },
      split: { winnerVotes: split.winner_votes, total: split.total },
    };
  });
  if (!result) return { ok: false, error: "duplicate" };
  return { ok: true, result };
}

// ---- controversial -------------------------------------------------------

export async function getControversial(db: Queryable, opts: { minVotes?: number; limit?: number } = {}) {
  const rows = await db.query<{ a_id: number; b_id: number; n: number; a_wins: number }>(
    `select a_id, b_id, count(*)::int as n, (count(*) filter (where winner_id = a_id))::int as a_wins
     from votes group by a_id, b_id having count(*) >= $1
     order by abs((count(*) filter (where winner_id = a_id))::float8 / count(*) - 0.5), count(*) desc
     limit $2`,
    [opts.minVotes ?? CONTROVERSIAL_MIN_VOTES, opts.limit ?? 30],
  );
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.flatMap((r) => [r.a_id, r.b_id]))];
  const chars = await db.query<Character>(
    `select ${CHARACTER_COLUMNS} from characters c join series s on s.slug = c.series where c.id = any($1::int[])`,
    [ids],
  );
  const byId = new Map(chars.map((c) => [c.id, c]));
  return rows.map((r) => ({ a: byId.get(r.a_id)!, b: byId.get(r.b_id)!, aWins: r.a_wins, total: r.n }));
}

/** Delete rate-limit windows older than two days. */
export async function purgeRateLimits(db: Queryable, now = Date.now()) {
  await db.query(`delete from rate_limits where window_start < $1`, [new Date(now - 2 * 86_400_000).toISOString()]);
}
