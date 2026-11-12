import Link from "next/link";
import { CharacterName, accent } from "./character";
import type { BoardRow } from "@/lib/service";
import { MIN_GAMES } from "@/lib/service";

type Series = { slug: string; name: string; color: string };

export function BoardTabs({ series, active }: { series: Series[]; active: string | null }) {
  return (
    <nav className="chips" aria-label="Boards">
      <Link className="chip" href="/rankings" aria-current={active === null ? "page" : undefined}>
        All series
      </Link>
      {series.map((s) => (
        <Link
          key={s.slug}
          className="chip"
          href={`/rankings/${s.slug}`}
          aria-current={active === s.slug ? "page" : undefined}
          style={accent(s.color)}
        >
          <span className="dot" aria-hidden /> {s.name}
        </Link>
      ))}
    </nav>
  );
}

/** One row's 95% interval on an axis shared by the whole board. */
function Interval({ row, lo, hi }: { row: BoardRow; lo: number; hi: number }) {
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const a = x(row.rating - row.ci);
  const b = x(row.rating + row.ci);
  return (
    <div
      className="ci"
      style={accent(row.color)}
      role="img"
      aria-label={`95% interval ${Math.round(row.rating - row.ci)} to ${Math.round(row.rating + row.ci)}`}
    >
      <span className="ci-bar" style={{ left: `${a}%`, width: `${b - a}%` }} />
      <span className="ci-dot" style={{ left: `${x(row.rating)}%` }} />
    </div>
  );
}

export function Board({
  ranked,
  provisional,
  showSeries,
}: {
  ranked: BoardRow[];
  provisional: BoardRow[];
  showSeries: boolean;
}) {
  const lo = Math.min(...ranked.map((r) => r.rating - r.ci));
  const hi = Math.max(...ranked.map((r) => r.rating + r.ci));
  return (
    <>
      {ranked.length === 0 ? (
        <p className="notice">
          Nobody has the {MIN_GAMES} matchups needed for a rank yet. <Link href="/">Cast a few votes</Link> to get the
          board started.
        </p>
      ) : (
        <div className="board-scroll">
          <table className="board">
            <thead>
              <tr>
                <th className="rank">#</th>
                <th>Character</th>
                <th className="num">Rating</th>
                <th className="interval hide-sm" aria-label="95% interval">
                  95% interval
                </th>
                <th className="num hide-xs">W–L</th>
                <th className="num hide-sm">Live Elo</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.id}>
                  <td className="rank">{r.rank}</td>
                  <td>
                    <CharacterName c={r} showSeries={showSeries} />
                  </td>
                  <td className="num">
                    {Math.round(r.rating)} <span className="muted small">±{Math.round(r.ci)}</span>
                  </td>
                  <td className="interval hide-sm">
                    <Interval row={r} lo={lo} hi={hi} />
                  </td>
                  <td className="num hide-xs">
                    {r.wins}–{r.losses}
                  </td>
                  <td className="num hide-sm muted">{Math.round(r.elo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {provisional.length > 0 && (
        <>
          <h2>Not ranked yet</h2>
          <p className="muted small">
            A character needs {MIN_GAMES} matchups before it gets a rank, so a lucky three-vote streak cannot top the
            board. Matchmaking gives these characters priority.
          </p>
          <ul className="provisional">
            {provisional.map((r) => (
              <li key={r.id}>
                <CharacterName c={r} showSeries={showSeries} />
                <div className="muted small" style={{ marginTop: 4 }}>
                  {r.games} of {MIN_GAMES} matchups
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export function FitMeta({ fittedAt, nVotes }: { fittedAt: Date; nVotes: number }) {
  return (
    <p className="meta">
      Bradley-Terry fit over {nVotes.toLocaleString("en-US")} {nVotes === 1 ? "vote" : "votes"}, last computed{" "}
      <time dateTime={fittedAt.toISOString()}>
        {fittedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
      </time>
      . Refits at most every ten minutes.
    </p>
  );
}
