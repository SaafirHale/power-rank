import type { Metadata } from "next";
import Link from "next/link";
import { CharacterName, accent } from "@/components/character";
import { getDb } from "@/lib/db";
import { CONTROVERSIAL_MIN_VOTES, getControversial } from "@/lib/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Most controversial matchups" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function ControversialPage() {
  const rows = await getControversial(await getDb());
  return (
    <>
      <h1>Most controversial matchups</h1>
      <p className="lede">
        The fights the crowd cannot settle. A pair qualifies with at least {CONTROVERSIAL_MIN_VOTES} votes and no more
        than a 70/30 split, and pairs are ordered by how confident we can be that the split is genuinely close: a 50/50
        split over 200 votes outranks 5–5 over 10.
      </p>
      {rows.length === 0 ? (
        <p className="notice">
          No matchup with {CONTROVERSIAL_MIN_VOTES}+ votes is that close yet. <Link href="/">Keep voting</Link>.
        </p>
      ) : (
        <ol className="matchups">
          {rows.map(({ a, b, aWins, total }) => {
            const share = aWins / total;
            return (
              <li key={`${a.id}:${b.id}`}>
                <div className="matchup-head">
                  <CharacterName c={a} showSeries={a.series !== b.series} />
                  <span className="muted small">vs</span>
                  <span className="right" style={{ display: "flex" }}>
                    <CharacterName c={b} showSeries={a.series !== b.series} />
                  </span>
                </div>
                <div
                  className="split"
                  role="img"
                  aria-label={`${pct(share)} ${a.name}, ${pct(1 - share)} ${b.name}`}
                  // The right side is a tint so same-series pairs stay readable.
                  style={{ background: `color-mix(in srgb, ${b.color} 45%, var(--surface-2))` }}
                >
                  <span style={{ ...accent(a.color), width: pct(share) }} />
                </div>
                <div className="split-labels">
                  <span>
                    {pct(share)} · {aWins}
                  </span>
                  <span className="muted">{total} votes</span>
                  <span>
                    {total - aWins} · {pct(1 - share)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
