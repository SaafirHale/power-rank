import { sigmoid } from "./bradley-terry";

export type Candidate = {
  id: number;
  series: string;
  /** Current Bradley-Terry strength (log scale). */
  theta: number;
  /** Its standard error. */
  se: number;
};

export type PickOptions = {
  /** Pair keys (see pairKey) this visitor may not see again. */
  exclude?: Set<string>;
  /** Uniform in [0, 1). Injected so tests are deterministic. */
  rng?: () => number;
  /** Share of picks made uniformly at random, so every pair gets some data. */
  explore?: number;
  /** Exponent on the weights; higher means greedier. */
  sharpness?: number;
};

export const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * How much a vote on this pair is expected to teach us. p(1-p) is the
 * variance of the outcome: largest when the two are evenly matched, near zero
 * for a foregone conclusion. Multiplying by the summed variance of the two
 * strengths favours characters the model is still unsure about.
 */
export function pairWeight(x: Candidate, y: Candidate): number {
  const p = sigmoid(x.theta - y.theta);
  return p * (1 - p) * (x.se ** 2 + y.se ** 2);
}

/**
 * Pick a pair, weighted toward informative ones. Returns the two in random
 * left/right order so screen position cannot bias the result, or null when
 * the visitor has already voted on every available pair.
 */
export function pickPair(cands: Candidate[], opts: PickOptions = {}): [Candidate, Candidate] | null {
  const rng = opts.rng ?? Math.random;
  const exclude = opts.exclude ?? new Set<string>();
  const explore = opts.explore ?? 0.1;
  const sharpness = opts.sharpness ?? 2;

  const pairs: [number, number][] = [];
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      if (exclude.has(pairKey(cands[i].id, cands[j].id))) continue;
      const w = pairWeight(cands[i], cands[j]) ** sharpness;
      pairs.push([i, j]);
      weights.push(w);
      total += w;
    }
  }
  if (pairs.length === 0) return null;

  let chosen: [number, number];
  if (rng() < explore || total <= 0) {
    chosen = pairs[Math.floor(rng() * pairs.length)];
  } else {
    let r = rng() * total;
    let k = 0;
    while (k < pairs.length - 1 && r >= weights[k]) r -= weights[k++];
    chosen = pairs[k];
  }
  const [x, y] = [cands[chosen[0]], cands[chosen[1]]];
  return rng() < 0.5 ? [x, y] : [y, x];
}
