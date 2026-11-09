import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { inputClasses } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Admin building blocks. Phone first: everything stacks below `sm`, and
 * inputs keep a 16px font on phones so iOS Safari doesn't zoom on focus.
 */

export const adminInput = cn(inputClasses, "h-11 text-base sm:h-10 sm:text-sm");
export const adminTextarea = cn(inputClasses, "h-auto py-2 text-base sm:text-sm");
export const adminSelect = cn(inputClasses, "select-chevron h-11 appearance-none pr-9 text-base sm:h-10 sm:text-sm");

export function PageHeader({
  title,
  description,
  back,
  actions,
  badges,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <div className="mb-6 space-y-2">
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            {badges}
          </div>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-2xl bg-white shadow-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 sm:px-5 sm:pt-5">
          <div>
            {title && <h2 className="font-bold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  change,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Percent change against the previous period; null when there's nothing to compare. */
  change?: number | null;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        {hint}
        {change !== undefined && change !== null && (
          <span className={cn("font-semibold", change >= 0 ? "text-success" : "text-danger")}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
            <span className="sr-only"> compared with the previous period</span>
          </span>
        )}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl bg-white p-4 shadow-card hover:ring-2 hover:ring-brand/30 sm:p-5">
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl bg-white p-4 shadow-card sm:p-5">{body}</div>
  );
}

/** Percent change from `previous` to `current`, or null if there was nothing before. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface text-muted">
        <Icon className="size-6" />
      </span>
      <p className="mt-3 font-bold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Scrollable pill tabs (filters). Each item is a link, so filters are shareable URLs. */
export function Tabs({
  items,
  label,
}: {
  items: { href: string; label: string; active: boolean; count?: number }[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap",
                item.active ? "bg-ink text-white" : "bg-white text-ink-soft shadow-card hover:bg-line",
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs",
                    item.active ? "bg-white/20 text-white" : "bg-surface text-ink",
                  )}
                >
                  {item.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  noun,
  href,
}: {
  page: number;
  pageCount: number;
  total: number;
  noun: [string, string];
  href: (page: number) => string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted">
        {total.toLocaleString("en-IN")} {total === 1 ? noun[0] : noun[1]}
      </p>
      {pageCount > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1">
          {page > 1 ? (
            <Link
              href={href(page - 1)}
              className="grid size-9 place-items-center rounded-full bg-white shadow-card hover:bg-line"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className="grid size-9 place-items-center rounded-full text-muted/50" aria-hidden="true">
              <ChevronLeft className="size-4" />
            </span>
          )}
          <span className="px-2 text-muted">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={href(page + 1)}
              className="grid size-9 place-items-center rounded-full bg-white shadow-card hover:bg-line"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className="grid size-9 place-items-center rounded-full text-muted/50" aria-hidden="true">
              <ChevronRight className="size-4" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}

/** Builds a URL for list pages: keeps current filters, drops empty values. */
export function listHref(
  path: string,
  current: Record<string, string | undefined>,
  next: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...next })) {
    if (value !== undefined && value !== "" && value !== null) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** First value of a search param. */
export function param(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined ? undefined : v.slice(0, 200);
}

export function DefinitionList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="space-y-2 text-sm">
      {items.map((item, i) => (
        <div key={i} className="flex justify-between gap-4">
          <dt className="text-muted">{item.label}</dt>
          <dd className="text-right font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  children: ReactNode;
}) {
  const tones = {
    info: "bg-brand-soft text-brand-dark",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
  };
  return <div className={cn("rounded-xl px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}
