/** CSV helpers for the admin exports. */

/** Quotes a value and neutralises spreadsheet formula injection (=, +, -, @ at the start). */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const istFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function istDateTime(date: Date | null | undefined): string {
  return date ? istFormat.format(date) : "";
}

/** A UTF-8 CSV download. The BOM makes Excel read ₹ and Indian names correctly. */
export function csvResponse(lines: string[], name: string): Response {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = name.replace(/[^a-z0-9_-]/gi, "-");
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
