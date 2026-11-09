type PgLikeError = { code?: string; constraint?: string; message?: string; cause?: unknown };

/** True for a Postgres unique violation, optionally on a specific constraint. Walks `cause` chains. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as PgLikeError;
    if (e.code === "23505") {
      if (!constraint) return true;
      return e.constraint === constraint || Boolean(e.message?.includes(constraint));
    }
    current = e.cause;
  }
  return false;
}
