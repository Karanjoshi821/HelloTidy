/**
 * Delivery date estimates for the product page. Couriers in India deliver
 * Monday to Saturday, so only Sundays are skipped; public holidays are not
 * known here, which is why the page shows a range rather than a promise.
 */

/** Today's date in India as YYYY-MM-DD (the store's calendar, whatever the visitor's time zone). */
export function indiaDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

function addWorkingDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) added++;
  }
  return d;
}

/** Earliest and latest delivery dates for an order placed on `dateKey` (YYYY-MM-DD, India). */
export function deliveryWindow(dateKey: string, range: { min: number; max: number }): { from: Date; to: Date } {
  const start = new Date(`${dateKey}T00:00:00Z`);
  return { from: addWorkingDays(start, range.min), to: addWorkingDays(start, range.max) };
}

const short = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "Tue, 4 Nov" */
export function formatDeliveryDate(date: Date): string {
  return short.format(date);
}
