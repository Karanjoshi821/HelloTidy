import "server-only";
import { eq, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { rateLimits } from "../db/schema";

/** True if the key has already reached its limit in the current window (does not count). */
export async function isRateLimited(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = await getDb();
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  return Boolean(row && row.windowStart === windowStart && row.count >= limit);
}

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Fixed-window rate limiter backed by Postgres, so the limit holds across all
 * serverless instances. One upsert per call.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const db = await getDb();
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} = excluded.window_start then ${rateLimits.count} + 1 else 1 end`,
        windowStart: sql`excluded.window_start`,
      },
    })
    .returning({ count: rateLimits.count });

  // Occasionally clear out stale windows.
  if (Math.random() < 0.01) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, now - 24 * 60 * 60 * 1000));
  }

  const count = row?.count ?? 1;
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.ceil((windowStart + windowMs - now) / 1000),
  };
}
