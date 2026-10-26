import type { CSSProperties } from "react";

export type CharacterLike = { name: string; form: string | null; seriesName: string; color: string };

/** Up to two initials, skipping particles like "D." so "Monkey D. Luffy" is "ML". */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}]/u.test(w) && !/^[A-Z]\.$/.test(w));
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export const accent = (color: string) => ({ "--c": color }) as CSSProperties;

export function CharacterName({ c, showSeries = false }: { c: CharacterLike; showSeries?: boolean }) {
  return (
    <span className="who" style={accent(c.color)}>
      <span className="mono-sm" aria-hidden>
        {initials(c.name)}
      </span>
      <span>
        <span className="name">{c.name}</span>
        {c.form && <span className="form"> ({c.form})</span>}
        {showSeries && <span className="form small"> · {c.seriesName}</span>}
      </span>
    </span>
  );
}
