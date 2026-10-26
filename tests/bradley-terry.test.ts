import { describe, expect, it } from "vitest";
import { fitBradleyTerry, sigmoid, type PairCount } from "../src/lib/bradley-terry";
import { mulberry32, spearman } from "./rng";

/** Simulate `games` random matchups between players with known strengths. */
function simulate(trueTheta: number[], games: number, seed: number): PairCount[] {
  const rng = mulberry32(seed);
  const n = trueTheta.length;
  const counts = new Map<string, PairCount>();
  for (let g = 0; g < games; g++) {
    let a = Math.floor(rng() * n);
    let b = Math.floor(rng() * (n - 1));
    if (b >= a) b++;
    if (a > b) [a, b] = [b, a];
    const key = `${a}:${b}`;
    const pc = counts.get(key) ?? { a, b, aWins: 0, bWins: 0 };
    if (rng() < sigmoid(trueTheta[a] - trueTheta[b])) pc.aWins++;
    else pc.bWins++;
    counts.set(key, pc);
  }
  return [...counts.values()];
}

describe("Bradley-Terry MM fit", () => {
  it("recovers a known ordering from synthetic votes", () => {
    const n = 30;
    // Evenly spaced true strengths from -3 to +3, shuffled so index order means nothing.
    const rng = mulberry32(7);
    const trueTheta = Array.from({ length: n }, (_, i) => -3 + (6 * i) / (n - 1)).sort(() => rng() - 0.5);
    const fit = fitBradleyTerry(n, simulate(trueTheta, 20_000, 42));

    expect(fit.converged).toBe(true);
    expect(fit.iterations).toBeLessThan(2_000);
    expect(spearman(trueTheta, fit.theta)).toBeGreaterThan(0.97);

    const top = (v: number[]) => v.indexOf(Math.max(...v));
    const bottom = (v: number[]) => v.indexOf(Math.min(...v));
    expect(top(fit.theta)).toBe(top(trueTheta));
    expect(bottom(fit.theta)).toBe(bottom(trueTheta));
  });

  it("puts the true strengths inside the 95% intervals about 95% of the time", () => {
    // Symmetric around 0, which is where the anchor pins the scale.
    const n = 20;
    const trueTheta = Array.from({ length: n }, (_, i) => -2 + (4 * i) / (n - 1));
    let covered = 0;
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const fit = fitBradleyTerry(n, simulate(trueTheta, 4_000, seed));
      fit.theta.forEach((t, i) => {
        total++;
        if (Math.abs(t - trueTheta[i]) <= 1.96 * fit.se[i]) covered++;
      });
    }
    expect(covered / total).toBeGreaterThan(0.88);
    expect(covered / total).toBeLessThan(0.995);
  });

  it("gives an unbeaten player with 3 games a modest rating and a wide interval", () => {
    // Players 0..9 have played each other plenty; player 10 has 3 wins and nothing else.
    const trueTheta = Array.from({ length: 10 }, (_, i) => (i - 5) / 2);
    const pairs = simulate(trueTheta, 3_000, 3);
    pairs.push({ a: 0, b: 10, aWins: 0, bWins: 1 }, { a: 1, b: 10, aWins: 0, bWins: 1 }, { a: 2, b: 10, aWins: 0, bWins: 1 });
    const fit = fitBradleyTerry(11, pairs);

    expect(Number.isFinite(fit.theta[10])).toBe(true);
    // Shrinkage keeps it below the strongest established player...
    expect(fit.theta[10]).toBeLessThan(Math.max(...fit.theta.slice(0, 10)));
    // ...and the model says it knows far less about it.
    const established = Math.max(...fit.se.slice(0, 10));
    expect(fit.se[10]).toBeGreaterThan(3 * established);
  });

  it("shrinks standard errors as games accumulate", () => {
    const trueTheta = [0, 0.5, 1, 1.5];
    const few = fitBradleyTerry(4, simulate(trueTheta, 100, 9));
    const many = fitBradleyTerry(4, simulate(trueTheta, 10_000, 9));
    for (let i = 0; i < 4; i++) expect(many.se[i]).toBeLessThan(few.se[i] / 5);
  });

  it("handles players with no games at all", () => {
    const fit = fitBradleyTerry(3, [{ a: 0, b: 1, aWins: 5, bWins: 5 }]);
    expect(fit.converged).toBe(true);
    expect(fit.theta[2]).toBeCloseTo(0, 6);
    // Worked by hand from the 3x3 information matrix, relative to the mean.
    expect(fit.se[2]).toBeCloseTo(2 / Math.sqrt(3), 6);
    expect(fit.se[2]).toBeGreaterThan(fit.se[0]);
    expect(fit.wins).toEqual([5, 5, 0]);
  });
});
