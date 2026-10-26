import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, prepare, type Db } from "../src/lib/db";
import { MIN_GAMES, getBoard, getControversial, wilsonLower } from "../src/lib/service";

/** Insert `total` raw votes on a pair, the first `xWins` of them won by x. */
async function votes(db: Db, x: number, y: number, total: number, xWins: number, tag: string) {
  const [a, b] = x < y ? [x, y] : [y, x];
  for (let k = 0; k < total; k++) {
    const winner = k < xWins ? x : y;
    await db.query(`insert into votes (a_id, b_id, winner_id, voter, day) values ($1, $2, $3, $4, '2026-10-01')`, [a, b, winner, `${tag}-${k}`]);
  }
}

describe("boards", () => {
  let db: Db;
  let ids: number[];
  let split: number[];
  beforeAll(async () => {
    db = await prepare(await createPgliteDb());
    ids = (await db.query<{ id: number }>(`select id from characters where series = 'jjk' order by id limit 6`)).map((r) => r.id);
    // A round robin among the first five, with a clear order 0 > 1 > 2 > 3 > 4.
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) await votes(db, ids[i], ids[j], 12, 9, `rr${i}${j}`);
    // The sixth wins its only three matchups, all against the top character.
    await votes(db, ids[5], ids[0], 3, 3, "lucky");
    // A perfectly split cross-series pair for the controversial page.
    const [x] = await db.query<{ id: number }>(`select id from characters where series = 'hxh' order by id limit 1`);
    split = [x.id, ids[2]];
    await votes(db, x.id, ids[2], 10, 5, "split");
  });
  afterAll(() => db.close());

  it("ranks by the fit and keeps a 3-vote character off the board", async () => {
    const { ranked, provisional } = await getBoard(db, "jjk");
    expect(ranked.map((r) => r.id)).toEqual(ids.slice(0, 5));
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(ranked.every((r) => r.games >= MIN_GAMES)).toBe(true);
    const lucky = provisional.find((r) => r.id === ids[5])!;
    expect(lucky.games).toBe(3);
    expect(lucky.rank).toBeNull();
    // Its interval is far wider than any ranked character's.
    expect(lucky.ci).toBeGreaterThan(1.5 * Math.max(...ranked.map((r) => r.ci)));
    // The cross-series board ranks the same five.
    const all = await getBoard(db, null);
    expect(all.ranked.map((r) => r.id)).toEqual(ids.slice(0, 5));
  });

  it("puts the closest well-voted split first on the controversial page", async () => {
    const rows = await getControversial(db, { minVotes: 10 });
    const first = rows[0];
    expect([first.a.id, first.b.id].sort()).toEqual([...split].sort());
    expect(first.total).toBe(10);
    expect(first.aWins).toBe(5);
    // The 3-vote pair is below the vote threshold, and the 9-3 round-robin
    // pairs are too one-sided to count as contested.
    expect(rows).toHaveLength(1);
  });

  it("scores controversy by closeness and sample size together", () => {
    expect(wilsonLower(100, 200)).toBeGreaterThan(wilsonLower(5, 10));
    expect(wilsonLower(5, 10)).toBeGreaterThan(wilsonLower(3, 10));
    expect(wilsonLower(45, 100)).toBeGreaterThan(wilsonLower(5, 10));
    expect(wilsonLower(0, 0)).toBe(0);
  });
});
