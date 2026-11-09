import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Database factory, shared by the app and the CLI scripts.
 *
 * - DATABASE_URL set → Postgres over node-postgres (Neon in production).
 * - Otherwise, outside production → embedded PGlite in .data/pglite, with
 *   migrations applied automatically, so `npm run dev` needs no setup.
 */
export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run a query: the database or an open transaction. */
export type Executor = Database | Tx;

export const migrationsFolder = path.join(process.cwd(), "drizzle");

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

export async function createDatabase(options: { url?: string; onPool?: (pool: Pool) => void } = {}): Promise<{
  db: Database;
  close: () => Promise<void>;
  kind: "postgres" | "pglite";
}> {
  const url = options.url ?? process.env.DATABASE_URL;
  if (url) {
    const pool = createPool(url);
    options.onPool?.(pool);
    return { db: drizzlePg(pool, { schema }), close: () => pool.end(), kind: "postgres" };
  }

  // A local `next build` without a database prerenders the storefront from a
  // throwaway in-memory copy (migrations seed the default catalogue). Build
  // workers run in parallel, so they must never share an on-disk PGlite. On
  // Vercel a missing database is a configuration error and fails the build.
  const localBuild = process.env.NEXT_PHASE === "phase-production-build" && !process.env.VERCEL;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PGLITE !== "1" && !localBuild) {
    throw new Error("DATABASE_URL is not set. Add a Postgres database (see README → Deploy).");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const dataDir = localBuild ? "memory://" : (process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  if (dataDir !== "memory://") mkdirSync(dataDir, { recursive: true });
  const client = dataDir === "memory://" ? new PGlite() : new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder });

  // The query-builder API is identical across drivers; only the driver type differs.
  return { db: db as unknown as Database, close: () => client.close(), kind: "pglite" };
}
