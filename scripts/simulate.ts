/**
 * Fill the local dev database with simulated votes so the boards have
 * something to show. Every simulated voter goes through the real path:
 * matchmaking, a signed matchup token, castVote with its duplicate and
 * rate-limit checks, and periodic refits.
 *
 * Hidden strengths are random (seeded), not anyone's opinion of who is
 * strongest, so the resulting order means nothing about the series.
 *
 * Stop `npm run dev` first: PGlite allows one process per data directory.
 *
 *   npm run simulate -- --voters 400 --votes 12 --seed 1 [--strength-seed 1]
 */
import { sigmoid } from "../src/lib/bradley-terry";
import { MemoryRateLimitStore } from "../src/lib/abuse";
import { createPgDb, createPgliteDb, prepare } from "../src/lib/db";
import { secret } from "../src/lib/env";
import { castVote, getMatchup, listSeries, refit } from "../src/lib/service";
import { mulberry32 } from "../tests/rng";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
}

async function main() {
  const voters = arg("voters", 400);
  const perVoter = arg("votes", 12);
  const rng = mulberry32(arg("seed", 1));
  const key = secret();

  const url = process.env.DATABASE_URL;
  if (url && !process.argv.includes("--allow-remote")) {
    throw new Error("DATABASE_URL is set; refusing to write simulated votes to a real database without --allow-remote");
  }
  const db = await prepare(url ? await createPgDb(url) : await createPgliteDb(process.env.PGLITE_DIR ?? ".data/pglite"));

  const chars = await db.query<{ id: number }>(`select id from characters where active`);
  // Strengths get their own seed so repeated runs with different --seed
  // values add more voters to the same simulated world.
  const srng = mulberry32(arg("strength-seed", 1));
  const gauss = () => Math.sqrt(-2 * Math.log(1 - srng())) * Math.cos(2 * Math.PI * srng());
  const strength = new Map(chars.map((c) => [c.id, 1.2 * gauss()]));
  const scopes = ["all", ...(await listSeries(db)).map((s) => s.slug)];

  const store = new MemoryRateLimitStore();
  const start = Date.now() - 7 * 86_400_000;
  let cast = 0;
  await refit(db);
  for (let v = 0; v < voters; v++) {
    const visitorId = `sim-${v}-${Math.floor(rng() * 1e9)}`;
    const ip = `sim-net-${v}`;
    // Half the voters stick to the cross-series pool, the rest pick one series.
    const scope = rng() < 0.5 ? "all" : scopes[1 + Math.floor(rng() * (scopes.length - 1))];
    let now = start + (v / voters) * 7 * 86_400_000;
    for (let k = 0; k < perVoter; k++) {
      now += 4_000 + rng() * 20_000;
      const m = await getMatchup(db, { visitorId, secret: key, scope, now, rng });
      if (!m) break;
      const p = sigmoid(strength.get(m.left.id)! - strength.get(m.right.id)!);
      const winnerId = rng() < p ? m.left.id : m.right.id;
      const r = await castVote(db, { visitorId, token: m.token, winnerId, ip, secret: key, now, store });
      if (!r.ok) continue;
      // Refit as votes come in so matchmaking reacts, as it would live.
      if (++cast % 250 === 0) await refit(db);
    }
  }
  await refit(db);
  console.log(`cast ${cast} simulated votes from ${voters} voters`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
