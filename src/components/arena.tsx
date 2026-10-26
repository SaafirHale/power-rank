"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { accent, initials } from "./character";

type Character = {
  id: number;
  name: string;
  form: string | null;
  series: string;
  seriesName: string;
  color: string;
  elo: number;
};

type Matchup = { left: Character; right: Character; token: string };

type Result = {
  winner: { id: number; elo: number; delta: number };
  loser: { id: number; elo: number; delta: number };
  split: { winnerVotes: number; total: number };
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; m: Matchup }
  | { kind: "voted"; m: Matchup; r: Result }
  | { kind: "done" }
  | { kind: "error"; message: string; m?: Matchup };

const ERRORS: Record<string, string> = {
  rate_limited: "That is a lot of votes in a short time. Take a breather and try again in a minute.",
  no_cookie: "Voting needs cookies enabled for this site.",
};

const fmtDelta = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d))}`;

export function Arena({ series }: { series: { slug: string; name: string; color: string }[] }) {
  const [scope, setScope] = useState("all");
  const [state, setState] = useState<State>({ kind: "loading" });
  const busy = useRef(false);

  const load = useCallback(async (s: string) => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/matchup?scope=${encodeURIComponent(s)}`, { cache: "no-store" });
      const data = await res.json();
      setState(data.done ? { kind: "done" } : { kind: "ready", m: data });
    } catch {
      setState({ kind: "error", message: "Could not load a matchup. Check your connection and retry." });
    }
  }, []);

  useEffect(() => {
    load(scope);
  }, [scope, load]);

  const vote = useCallback(
    async (m: Matchup, winnerId: number) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: m.token, winnerId }),
        });
        const data = await res.json();
        if (res.ok) setState({ kind: "voted", m, r: data });
        // Stale or repeated matchup: just deal a fresh one.
        else if (data.error === "duplicate" || data.error === "bad_token") await load(scope);
        else setState({ kind: "error", message: ERRORS[data.error] ?? "That vote did not go through.", m });
      } catch {
        setState({ kind: "error", message: "That vote did not go through. Check your connection.", m });
      } finally {
        busy.current = false;
      }
    },
    [load, scope],
  );

  // Keyboard: left/right arrows vote, Enter or Space moves on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (state.kind === "ready" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        vote(state.m, e.key === "ArrowLeft" ? state.m.left.id : state.m.right.id);
      } else if (state.kind === "voted" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        load(scope);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, vote, load, scope]);

  const m = state.kind === "ready" || state.kind === "voted" ? state.m : state.kind === "error" ? state.m : undefined;
  const r = state.kind === "voted" ? state.r : undefined;

  return (
    <section aria-live="polite">
      <div className="chips" role="group" aria-label="Which series to draw from">
        <button className="chip" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
          All series
        </button>
        {series.map((s) => (
          <button key={s.slug} className="chip" aria-pressed={scope === s.slug} onClick={() => setScope(s.slug)} style={accent(s.color)}>
            <span className="dot" aria-hidden /> {s.name}
          </button>
        ))}
      </div>

      {state.kind === "loading" && <div className="notice">Finding an informative matchup…</div>}
      {state.kind === "done" && (
        <div className="notice">
          You have voted on every matchup in this pool today. Try another series, or come back tomorrow.
        </div>
      )}

      {m && (
        <div className="arena">
          <Card c={m.left} hint="←" result={r} onPick={() => vote(m, m.left.id)} disabled={state.kind !== "ready"} />
          <div className="vs" aria-hidden>
            VS
          </div>
          <Card c={m.right} hint="→" result={r} onPick={() => vote(m, m.right.id)} disabled={state.kind !== "ready"} />
        </div>
      )}

      {state.kind === "error" && <div className="notice">{state.message}</div>}

      {r && m && (
        <div className="after">
          <div style={{ flex: "1 1 280px" }}>
            <SplitSummary m={m} r={r} />
          </div>
          <button className="btn" onClick={() => load(scope)} autoFocus>
            Next matchup
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <p className="muted small" style={{ marginTop: 16 }}>
          Click a card, or use the ← and → keys.
        </p>
      )}
    </section>
  );
}

function Card({
  c,
  hint,
  result,
  onPick,
  disabled,
}: {
  c: Character;
  hint: string;
  result?: Result;
  onPick: () => void;
  disabled: boolean;
}) {
  const side = result ? (result.winner.id === c.id ? result.winner : result.loser) : undefined;
  const cls = result ? (result.winner.id === c.id ? "card won" : "card lost") : "card";
  return (
    <button className={cls} style={accent(c.color)} onClick={onPick} disabled={disabled} aria-label={`${c.name}${c.form ? ` (${c.form})` : ""} wins`}>
      {!result && (
        <span className="key-hint" aria-hidden>
          {hint}
        </span>
      )}
      <span className="monogram" aria-hidden>
        {initials(c.name)}
      </span>
      <span className="card-name">{c.name}</span>
      {c.form && <span className="card-form">{c.form}</span>}
      {side && (
        <span className="card-result">
          Live Elo {Math.round(side.elo)}{" "}
          <span className={side.delta >= 0 ? "up" : "down"}>({fmtDelta(side.delta)})</span>
        </span>
      )}
      <span className="card-series">
        <span className="dot" aria-hidden /> {c.seriesName}
      </span>
    </button>
  );
}

function SplitSummary({ m, r }: { m: Matchup; r: Result }) {
  const winner = r.winner.id === m.left.id ? m.left : m.right;
  const others = r.split.total - 1;
  const share = r.split.winnerVotes / r.split.total;
  if (others === 0) return <p style={{ margin: 0 }}>First vote on this matchup. You set the line.</p>;
  const agree = r.split.winnerVotes - 1;
  return (
    <div>
      <p style={{ margin: "0 0 8px" }}>
        {agree} of {others} earlier {others === 1 ? "voter" : "voters"} also picked {winner.name}.
      </p>
      <div className="split" style={accent(winner.color)} role="img" aria-label={`${Math.round(share * 100)}% for ${winner.name}`}>
        <span style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}
