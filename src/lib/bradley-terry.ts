/**
 * Bradley-Terry model fitted by the MM algorithm (Hunter, 2004).
 *
 * Each player i has a positive strength p_i and P(i beats j) = p_i / (p_i + p_j).
 * We work with theta_i = ln p_i, so P(i beats j) = sigmoid(theta_i - theta_j).
 *
 * A plain maximum-likelihood fit diverges for anyone who has never lost (or
 * never won), and is not identified for players with no games. Both are fixed
 * with the usual trick of virtual games: every player plays `priorGames`
 * games against a fixed anchor of strength 1 (theta = 0), winning half. That
 * is equivalent to a weak prior pulling everyone toward the anchor, so a
 * character with three wins sits only a little above average with a wide
 * interval, instead of at +infinity.
 */

export type PairCount = {
  /** Player indices, 0..n-1. */
  a: number;
  b: number;
  aWins: number;
  bWins: number;
};

export type FitOptions = {
  /** Virtual games per player against the anchor (half won). Default 2. */
  priorGames?: number;
  maxIter?: number;
  /** Stop when no theta moves by more than this. */
  tol?: number;
};

export type FitResult = {
  theta: number[];
  /** Standard error of each theta, from the inverse Fisher information. */
  se: number[];
  wins: number[];
  losses: number[];
  iterations: number;
  converged: boolean;
};

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function fitBradleyTerry(n: number, pairs: PairCount[], opts: FitOptions = {}): FitResult {
  const prior = opts.priorGames ?? 2;
  const maxIter = opts.maxIter ?? 10_000;
  const tol = opts.tol ?? 1e-9;
  if (prior <= 0) throw new Error("priorGames must be positive");

  const wins = new Array<number>(n).fill(0);
  const losses = new Array<number>(n).fill(0);
  // Adjacency list of opponents with total games played against them.
  const opp: { j: number; games: number }[][] = Array.from({ length: n }, () => []);
  for (const { a, b, aWins, bWins } of pairs) {
    if (a === b) continue;
    const games = aWins + bWins;
    if (games <= 0) continue;
    wins[a] += aWins;
    losses[a] += bWins;
    wins[b] += bWins;
    losses[b] += aWins;
    opp[a].push({ j: b, games });
    opp[b].push({ j: a, games });
  }

  const p = new Array<number>(n).fill(1);
  let iterations = 0;
  let converged = false;

  while (iterations < maxIter) {
    iterations++;
    const before = p.map(Math.log);
    // Gauss-Seidel order: each update uses the freshest strengths, which
    // converges noticeably faster than updating all players at once.
    for (let i = 0; i < n; i++) {
      let denom = prior / (p[i] + 1);
      for (const { j, games } of opp[i]) denom += games / (p[i] + p[j]);
      p[i] = (wins[i] + prior / 2) / denom;
    }
    // MM alone crawls along one direction: scaling every strength together
    // changes only the few virtual games, so with lots of real votes it takes
    // tens of thousands of sweeps to settle. Solve that direction exactly
    // instead. Both steps increase the likelihood, so the fit still converges.
    const scale = bestCommonScale(p, prior);
    let maxStep = 0;
    for (let i = 0; i < n; i++) {
      p[i] *= scale;
      maxStep = Math.max(maxStep, Math.abs(Math.log(p[i]) - before[i]));
    }
    if (maxStep < tol) {
      converged = true;
      break;
    }
  }

  const raw = p.map(Math.log);
  const se = standardErrors(raw, opp, prior);
  // Only differences in theta mean anything, so report strengths relative to
  // the average character (mean 0), matching how the errors are computed.
  const mean = n ? raw.reduce((s, x) => s + x, 0) / n : 0;
  const theta = raw.map((t) => t - mean);
  return { theta, se, wins, losses, iterations, converged };
}

/**
 * The c > 0 maximising the likelihood of p scaled by c. Real games depend only
 * on ratios, so only the anchor games matter: solve
 *   sum_i c p_i / (c p_i + 1) = n / 2
 * by Newton's method in log c (the left side is increasing in c).
 */
function bestCommonScale(p: number[], prior: number): number {
  if (p.length === 0 || prior <= 0) return 1;
  let logC = 0;
  for (let k = 0; k < 50; k++) {
    let f = -p.length / 2;
    let df = 0;
    for (const pi of p) {
      const q = sigmoid(Math.log(pi) + logC);
      f += q;
      df += q * (1 - q);
    }
    const step = f / df;
    logC -= Math.max(-5, Math.min(5, step));
    if (Math.abs(step) < 1e-13) break;
  }
  return Math.exp(logC);
}

/**
 * Observed Fisher information of the log-likelihood in theta, inverted to a
 * covariance matrix C. Off-diagonal I_ij = -n_ij q(1-q); the diagonal sums
 * those plus the anchor games, which keeps the matrix positive definite.
 *
 * The overall level of every theta is pinned only by the virtual games, so
 * C_ii alone carries a shared "where is zero" uncertainty that more votes
 * never reduce. What matters is each character relative to the field, so we
 * return the standard error of theta_i - mean(theta):
 *   Var = C_ii - 2 mean_j C_ij + mean_jk C_jk.
 */
function standardErrors(theta: number[], opp: { j: number; games: number }[][], prior: number): number[] {
  const n = theta.length;
  const info: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const q0 = sigmoid(theta[i]);
    info[i][i] += prior * q0 * (1 - q0);
    for (const { j, games } of opp[i]) {
      const q = sigmoid(theta[i] - theta[j]);
      const v = games * q * (1 - q);
      info[i][i] += v;
      info[i][j] -= v;
    }
  }
  const c = invertSpd(info);
  const rowMean = c.map((row) => row.reduce((s, x) => s + x, 0) / n);
  const grand = rowMean.reduce((s, x) => s + x, 0) / n;
  return c.map((row, i) => Math.sqrt(Math.max(row[i] - 2 * rowMean[i] + grand, 0)));
}

/** Gauss-Jordan inverse with partial pivoting. n is a few hundred at most. */
function invertSpd(m: Float64Array[]): Float64Array[] {
  const n = m.length;
  const a = m.map((row) => Float64Array.from(row));
  const inv = Array.from({ length: n }, (_, i) => {
    const r = new Float64Array(n);
    r[i] = 1;
    return r;
  });
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [inv[col], inv[pivot]] = [inv[pivot], inv[col]];
    const d = a[col][col];
    if (Math.abs(d) < 1e-300) throw new Error("information matrix is singular");
    for (let k = 0; k < n; k++) {
      a[col][k] /= d;
      inv[col][k] /= d;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f === 0) continue;
      for (let k = 0; k < n; k++) {
        a[r][k] -= f * a[col][k];
        inv[r][k] -= f * inv[col][k];
      }
    }
  }
  return inv;
}

/** Elo-style display scale: 1500 is the anchor, 400 points is 10:1 odds. */
export const RATING_SCALE = 400 / Math.LN10;
export const toRating = (theta: number) => 1500 + theta * RATING_SCALE;
