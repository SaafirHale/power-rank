import { describe, expect, it } from "vitest";
import { pairKey, pairWeight, pickPair, type Candidate } from "../src/lib/matchmaking";
import { mulberry32 } from "./rng";

const c = (id: number, theta: number, se: number, series = "x"): Candidate => ({ id, theta, se, series });

describe("matchmaking", () => {
  it("weights even, uncertain pairs above lopsided, settled ones", () => {
    const even = pairWeight(c(1, 0, 0.5), c(2, 0.1, 0.5));
    const lopsided = pairWeight(c(1, 0, 0.5), c(3, 4, 0.5));
    const settled = pairWeight(c(1, 0, 0.05), c(2, 0.1, 0.05));
    expect(even).toBeGreaterThan(10 * lopsided);
    expect(even).toBeGreaterThan(10 * settled);
  });

  it("picks informative pairs far more often than random would", () => {
    // Two close, uncertain characters among eight spread-out, well-known ones.
    const cands = [c(1, 0, 1), c(2, 0.2, 1), ...Array.from({ length: 8 }, (_, i) => c(10 + i, -4 + i, 0.1))];
    const rng = mulberry32(1);
    let hits = 0;
    const draws = 2_000;
    for (let k = 0; k < draws; k++) {
      const [x, y] = pickPair(cands, { rng })!;
      if (pairKey(x.id, y.id) === "1:2") hits++;
    }
    // Uniform choice would land on this pair 1 time in 45.
    expect(hits / draws).toBeGreaterThan(0.3);
  });

  it("still explores: every pair turns up eventually", () => {
    const cands = Array.from({ length: 6 }, (_, i) => c(i, i * 3, 0.1));
    const rng = mulberry32(2);
    const seen = new Set<string>();
    for (let k = 0; k < 3_000; k++) {
      const [x, y] = pickPair(cands, { rng })!;
      seen.add(pairKey(x.id, y.id));
    }
    expect(seen.size).toBe(15);
  });

  it("never offers a pair the visitor already voted on today", () => {
    const cands = [c(1, 0, 1), c(2, 0, 1), c(3, 5, 0.1)];
    const exclude = new Set([pairKey(2, 1)]);
    const rng = mulberry32(3);
    for (let k = 0; k < 500; k++) {
      const [x, y] = pickPair(cands, { rng, exclude })!;
      expect(pairKey(x.id, y.id)).not.toBe("1:2");
    }
  });

  it("returns null once every pair is used up", () => {
    const cands = [c(1, 0, 1), c(2, 0, 1)];
    expect(pickPair(cands, { exclude: new Set(["1:2"]) })).toBeNull();
    expect(pickPair([c(1, 0, 1)])).toBeNull();
  });

  it("shows each side on the left about half the time", () => {
    const cands = [c(1, 0, 1), c(2, 0, 1)];
    const rng = mulberry32(4);
    let leftIsOne = 0;
    for (let k = 0; k < 2_000; k++) if (pickPair(cands, { rng })![0].id === 1) leftIsOne++;
    expect(leftIsOne / 2_000).toBeGreaterThan(0.45);
    expect(leftIsOne / 2_000).toBeLessThan(0.55);
  });
});
