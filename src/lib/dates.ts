/**
 * India-time (IST, UTC+05:30, no daylight saving) date helpers for admin
 * filters and reports. Dates in URLs are plain "YYYY-MM-DD" in IST.
 */

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" for the IST calendar day of a moment. */
export function istYmd(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of an IST calendar day ("2026-10-25" → 2026-10-24T18:30:00Z), or null if invalid. */
export function istDayStart(ymd: string | null | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const date = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime()) || istYmd(date) !== ymd) return null;
  return date;
}

/** Start of today in IST, minus `daysAgo` days. */
export function startOfIndianDay(daysAgo = 0, now = new Date()): Date {
  const start = istDayStart(istYmd(now))!;
  return new Date(start.getTime() - daysAgo * DAY_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Whole IST days in [from, to). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * A report/filter range from "from"/"to" query values (inclusive IST days).
 * Falls back to the last `defaultDays` days; caps the span at `maxDays`.
 */
export function parseIstRange(
  fromValue: string | null | undefined,
  toValue: string | null | undefined,
  defaultDays = 30,
  maxDays = 400,
): { from: Date; to: Date; fromYmd: string; toYmd: string; days: number } {
  const today = startOfIndianDay(0);
  let to = istDayStart(toValue) ?? today;
  if (to > today) to = today;
  let from = istDayStart(fromValue) ?? addDays(to, -(defaultDays - 1));
  if (from > to) from = to;
  if (daysBetween(from, to) + 1 > maxDays) from = addDays(to, -(maxDays - 1));
  const end = addDays(to, 1);
  return { from, to: end, fromYmd: istYmd(from), toYmd: istYmd(to), days: daysBetween(from, end) };
}
