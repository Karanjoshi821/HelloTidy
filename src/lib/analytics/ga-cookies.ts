/**
 * Google Analytics cookie parsing, so the server can send the purchase for
 * the same browser and visit (Measurement Protocol). The cookies only exist
 * when the visitor accepted cookies, since GA doesn't load otherwise.
 */

/** "_ga" = "GA1.1.1234567890.1700000000" → "1234567890.1700000000". */
export function gaClientIdFromCookie(value: string | undefined): string | undefined {
  const m = value?.match(/^GA\d\.\d+\.(\d+\.\d+)$/);
  return m?.[1];
}

/**
 * "_ga_<id>" holds the current session: "GS1.1.1700000000.3.1…" (older) or
 * "GS2.1.s1700000000$o3$g1…" (newer). Returns "1700000000".
 */
export function gaSessionIdFromCookie(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v2 = value.match(/^GS2\.\d+\.s(\d+)/);
  if (v2) return v2[1];
  const v1 = value.match(/^GS1\.\d+\.(\d+)\./);
  return v1?.[1];
}

/** The session cookie's name for a measurement id: "G-ABC123" → "_ga_ABC123". */
export function gaSessionCookieName(measurementId: string): string {
  return `_ga_${measurementId.replace(/^G-/, "")}`;
}
