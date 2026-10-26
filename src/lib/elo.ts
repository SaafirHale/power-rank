/**
 * Live Elo, updated on every vote so the voter sees an immediate number move.
 * It is order-dependent and noisy by design; the boards use the Bradley-Terry
 * fit instead, which looks at every vote at once.
 */

export const ELO_START = 1500;

/** Bigger steps while a character is new, smaller once it has settled. */
export function kFactor(games: number): number {
  return games < 30 ? 32 : 16;
}

export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

export function eloUpdate(
  winner: { elo: number; games: number },
  loser: { elo: number; games: number },
): { winner: number; loser: number } {
  const e = expectedScore(winner.elo, loser.elo);
  return {
    winner: winner.elo + kFactor(winner.games) * (1 - e),
    loser: loser.elo - kFactor(loser.games) * (1 - e),
  };
}
