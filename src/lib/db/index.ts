import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { createDatabase, type Database } from "./client";

export type { Database, Executor, Tx } from "./client";

const globalForDb = globalThis as unknown as { __helloTidyDb?: Promise<Database> };

/** Lazily creates one database client per server instance. */
export function getDb(): Promise<Database> {
  if (!globalForDb.__helloTidyDb) {
    globalForDb.__helloTidyDb = createDatabase({
      // Lets Vercel Fluid Compute release idle connections before suspending.
      onPool: (pool) => attachDatabasePool(pool),
    })
      .then(({ db }) => db)
      .catch((error: unknown) => {
        globalForDb.__helloTidyDb = undefined;
        throw error;
      });
  }
  return globalForDb.__helloTidyDb;
}
