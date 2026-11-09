/**
 * What an admin form action returns. `secret` carries a value shown once to
 * the owner (a new staff member's one-time password) and never stored.
 */
export type ActionResult = { ok: boolean; message: string; secret?: string } | null;
