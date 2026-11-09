/** Joins class names, skipping falsy values. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const dateOnly = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export function formatDateTime(date: Date | string): string {
  return dateTime.format(new Date(date));
}

export function formatDate(date: Date | string): string {
  return dateOnly.format(new Date(date));
}
