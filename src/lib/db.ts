import { SCHEMA } from "./schema";
import { seed } from "./seed";

/**
 * Two backends behind one small interface:
 * - DATABASE_URL set: node-postgres (works with Neon or any Postgres).
 * - otherwise: PGlite, Postgres compiled to WASM, persisted under .data/
 *   (or in memory for tests). No account or local install needed.
 */

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  exec(sql: string): Promise<void>;
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) (await import("node:fs")).mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  const q = (runner: { query: typeof pg.query }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) {
      return (await runner.query<T>(sql, params as never[])).rows;
    },
  });
  return {
    ...q(pg),
    async exec(sql) {
      await pg.exec(sql);
    },
    async tx(fn) {
      return pg.transaction((t) => fn(q(t as unknown as { query: typeof pg.query })));
    },
    async close() {
      await pg.close();
    },
  };
}

export async function createPgDb(connectionString: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: 5 });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      return (await pool.query(sql, params)).rows as T[];
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn({
          async query<T>(sql: string, params?: unknown[]) {
            return (await client.query(sql, params)).rows as T[];
          },
        });
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

/** Schema + seed. Idempotent. */
export async function prepare(db: Db): Promise<Db> {
  await db.exec(SCHEMA);
  await seed(db);
  return db;
}

const g = globalThis as unknown as { __powerRankDb?: Promise<Db> };

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): Promise<Db> {
  if (!g.__powerRankDb) {
    const url = process.env.DATABASE_URL;
    // Serverless disks are temporary: PGlite there would silently lose every vote.
    if (!url && process.env.VERCEL) throw new Error("DATABASE_URL is not set");
    g.__powerRankDb = (url ? createPgDb(url) : createPgliteDb(process.env.PGLITE_DIR ?? ".data/pglite")).then(prepare);
    g.__powerRankDb.catch(() => (g.__powerRankDb = undefined));
  }
  return g.__powerRankDb;
}
