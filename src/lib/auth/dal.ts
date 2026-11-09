import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { validateSession, type SessionUser } from "./session";

/**
 * Data access layer for admin authentication. Every admin page, server action
 * and route handler calls one of these; the proxy redirect is only a UX nicety.
 */

/** Deduplicated per request. */
export const getAdmin = cache(async (): Promise<SessionUser | null> => validateSession());

/**
 * The signed-in admin, or a redirect to the login page. Someone still on a
 * one-time password is sent to choose their own first; only the account page
 * and its password action pass `allowPasswordSetup`.
 */
export async function requireAdmin(opts: { allowPasswordSetup?: boolean } = {}): Promise<SessionUser> {
  const user = await getAdmin();
  if (!user) redirect("/admin/login");
  if (user.mustChangePassword && !opts.allowPasswordSetup) redirect("/admin/account?setup=1");
  return user;
}

export async function requireOwner(): Promise<SessionUser> {
  const user = await requireAdmin();
  if (user.role !== "owner") redirect("/admin?denied=1");
  return user;
}
