/**
 * Applies pending migrations in ./drizzle.
 *
 *   npm run db:migrate                 → uses DATABASE_URL_UNPOOLED or DATABASE_URL
 *   tsx scripts/migrate.ts --if-configured  → no-op when no database is configured (used by `build`)
 */
import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPool, migrationsFolder } from "../src/lib/db/client";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    if (process.argv.includes("--if-configured")) {
      console.log("[migrate] No DATABASE_URL set, skipping migrations.");
      return;
    }
    console.log("[migrate] No DATABASE_URL set. Local dev uses PGlite, which migrates itself on start.");
    return;
  }
  const pool = createPool(url);
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log("[migrate] Database is up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] Failed:", error);
  process.exit(1);
});
