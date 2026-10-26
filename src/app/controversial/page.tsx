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
        The fights the crowd cannot settle: pairs with at least {CONTROVERSIAL_MIN_VOTES} votes, sorted by how close the
        split is to 50/50, then by how many people voted.
      </p>
      {rows.length === 0 ? (
        <p className="notice">
          No matchup has {CONTROVERSIAL_MIN_VOTES} votes yet. <Link href="/">Start voting</Link>.
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
                  style={{ background: b.color }}
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
