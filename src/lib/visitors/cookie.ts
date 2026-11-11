import "server-only";
import { cookies } from "next/headers";
import { isProduction } from "../env";

/**
 * Set only for a visitor who accepted cookies, and cleared when they take it
 * back. Holds a random UUID; nothing reads visitor details back to a browser,
 * so a forged value can only add page views. Set by the server because Safari
 * caps cookies written by scripts at 7 days.
 */
export const VISITOR_COOKIE = "hellotidy_vid";

/** A year from the last visit. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function visitorCookie(): Promise<string | null> {
  const value = (await cookies()).get(VISITOR_COOKIE)?.value;
  return value && UUID.test(value) ? value : null;
}

export async function keepVisitorCookie(id: string): Promise<void> {
  (await cookies()).set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function dropVisitorCookie(): Promise<void> {
  (await cookies()).delete(VISITOR_COOKIE);
}
