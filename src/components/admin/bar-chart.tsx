import { cn } from "@/lib/utils";

/**
 * Simple bar chart in HTML/CSS (crisp at any width, no chart library). Screen
 * readers get the same numbers as a table. At most ~6 x-axis labels are shown,
 * centred under their bars, so they never collide on a phone.
 */
export function BarChart({
  data,
  format,
  caption,
  className,
  emptyText = "No sales in this period yet",
}: {
  data: { label: string; short: string; value: number }[];
  format: (value: number) => string;
  caption: string;
  className?: string;
  emptyText?: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  const every = Math.max(1, Math.ceil(data.length / 6));
  return (
    <figure className={className}>
      <div className="relative">
        <div className="flex h-44 items-end gap-[3px] sm:gap-1" aria-hidden="true">
          {data.map((d) => (
            <div key={d.label} className="group relative flex h-full flex-1 items-end">
              <div
                className={cn("w-full rounded-t-md", d.value > 0 ? "bg-brand group-hover:bg-brand-dark" : "bg-line")}
                style={{ height: max ? `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 1.5)}%` : "1.5%" }}
                title={`${d.short}: ${format(d.value)}`}
              />
            </div>
          ))}
        </div>
        {max === 0 && (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted" aria-hidden="true">
            {emptyText}
          </p>
        )}
      </div>
      <div className="relative mt-2 h-4 text-[11px] text-muted" aria-hidden="true">
        {data.map((d, i) =>
          i % every === 0 ? (
            <span
              key={d.label}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${((i + 0.5) / data.length) * 100}%` }}
            >
              {d.short}
            </span>
          ) : null,
        )}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.short}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const shortDay = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const shortMonth = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

/** "2026-10-25" → "25 Oct"; "2026-10" → "Oct 26". */
export function shortLabel(key: string): string {
  return key.length === 7
    ? shortMonth.format(new Date(`${key}-01T00:00:00Z`))
    : shortDay.format(new Date(`${key}T00:00:00Z`));
}
