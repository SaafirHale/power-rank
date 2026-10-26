import { createHash } from "node:crypto";
import { CHARACTERS, SERIES, characterSlug } from "../data/series";
import type { Queryable } from "./db";

/**
 * Upsert series and characters from src/data. New entries are inserted;
 * existing ones keep their id, Elo and votes but pick up renamed fields.
 * Characters removed from the data file are marked inactive, not deleted,
 * so their votes stay valid.
 */
export async function seed(db: Queryable): Promise<void> {
  // Skip the per-row upserts when the data file has not changed since last run.
  const version = createHash("sha256").update(JSON.stringify([SERIES, CHARACTERS])).digest("hex");
  const [row] = await db.query<{ value: string }>(`select value from meta where key = 'seed'`);
  if (row?.value === version) return;

  for (const [i, s] of SERIES.entries()) {
    await db.query(
      `insert into series (slug, name, color, sort) values ($1, $2, $3, $4)
       on conflict (slug) do update set name = excluded.name, color = excluded.color, sort = excluded.sort`,
      [s.slug, s.name, s.color, i],
    );
  }
  const slugs: string[] = [];
  for (const s of SERIES) {
    for (const c of CHARACTERS[s.slug] ?? []) {
      const slug = characterSlug(s.slug, c);
      slugs.push(slug);
      await db.query(
        `insert into characters (slug, name, form, series) values ($1, $2, $3, $4)
         on conflict (slug) do update set name = excluded.name, form = excluded.form,
           series = excluded.series, active = true`,
        [slug, c.name, c.form ?? null, s.slug],
      );
    }
  }
  await db.query(`update characters set active = false where not (slug = any($1::text[]))`, [slugs]);
  await db.query(
    `insert into meta (key, value) values ('seed', $1) on conflict (key) do update set value = excluded.value`,
    [version],
  );
}
