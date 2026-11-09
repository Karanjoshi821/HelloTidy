import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart, shortLabel } from "@/components/admin/bar-chart";
import { adminInput, Card, PageHeader, percentChange, StatCard } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth/dal";
import { getSalesReport } from "@/lib/analytics/reports";
import { addDays, istYmd, parseIstRange, startOfIndianDay } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

const PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  await requireOwner();
  const sp = await searchParams;
  const range = parseIstRange(
    typeof sp.from === "string" ? sp.from : undefined,
    typeof sp.to === "string" ? sp.to : undefined,
  );
  const report = await getSalesReport(range);
  const { current: c, previous: p } = report;
  const today = istYmd(startOfIndianDay(0));
  const totalMethod = report.byMethod.cod.orders + report.byMethod.prepaid.orders;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`${range.fromYmd === range.toYmd ? shortLabel(range.fromYmd) : `${shortLabel(range.fromYmd)} – ${shortLabel(range.toYmd)}`} (${range.days} day${range.days === 1 ? "" : "s"}), compared with the ${range.days} days before. India time.`}
      />

      <div className="flex flex-wrap items-end gap-2">
        <nav aria-label="Date range" className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const from = istYmd(addDays(startOfIndianDay(0), -(preset.days - 1)));
            const active = range.fromYmd === from && range.toYmd === today;
            return (
              <Link
                key={preset.days}
                href={`/admin/analytics?from=${from}&to=${today}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold",
                  active ? "bg-ink text-white" : "bg-white shadow-card hover:bg-line",
                )}
              >
                {preset.label}
              </Link>
            );
          })}
        </nav>
        <form action="/admin/analytics" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold">
            From
            <input
              type="date"
              name="from"
              defaultValue={range.fromYmd}
              max={today}
              className={cn(adminInput, "w-40")}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            To
            <input type="date" name="to" defaultValue={range.toYmd} max={today} className={cn(adminInput, "w-40")} />
          </label>
          <button type="submit" className={buttonClasses("secondary", "sm", "h-11 sm:h-10")}>
            Apply
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Net sales"
          value={formatPaise(c.net)}
          change={percentChange(c.net, p.net)}
          hint="After discounts & refunds"
        />
        <StatCard label="Orders" value={c.orders.toLocaleString("en-IN")} change={percentChange(c.orders, p.orders)} />
        <StatCard label="Average order" value={formatPaise(c.aov)} change={percentChange(c.aov, p.aov)} />
        <StatCard
          label="Units sold"
          value={c.units.toLocaleString("en-IN")}
          change={percentChange(c.units, p.units)}
          hint="Packs"
        />
      </div>

      <Card
        title={report.monthly ? "Sales by month" : "Sales by day"}
        description="Net sales of orders that went through."
      >
        <BarChart
          data={report.series.map((s) => ({ label: s.label, short: shortLabel(s.label), value: s.net }))}
          format={formatPaise}
          caption={report.monthly ? "Net sales by month" : "Net sales by day"}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="Where the money went">
          <Table
            head={["Item", "Amount"]}
            rows={[
              ["Gross sales (at your prices)", formatPaise(c.gross)],
              ["Discounts", `−${formatPaise(c.discounts)}`],
              ["COD charges collected", formatPaise(c.codFees)],
              ["Refunds", `−${formatPaise(c.refunds)}`],
              [<strong key="n">Net sales</strong>, <strong key="v">{formatPaise(c.net)}</strong>],
            ]}
          />
        </Card>

        <Card title="Packs sold">
          {report.byPack.length === 0 ? (
            <p className="text-sm text-muted">No sales in this period.</p>
          ) : (
            <Table
              head={["Pack", "Units", "Sales"]}
              rows={report.byPack.map((r) => [r.name, r.units.toLocaleString("en-IN"), formatPaise(r.revenue)])}
            />
          )}
        </Card>

        <Card
          title="COD vs prepaid"
          description="Return-to-origin (RTO) rate = refused or undeliverable ÷ finished deliveries, for orders placed in this period."
        >
          <Table
            head={["Metric", "COD", "Prepaid"]}
            rows={[
              [
                "Orders",
                `${report.byMethod.cod.orders} (${pct(report.byMethod.cod.orders, totalMethod)})`,
                `${report.byMethod.prepaid.orders} (${pct(report.byMethod.prepaid.orders, totalMethod)})`,
              ],
              ["Net sales", formatPaise(report.byMethod.cod.net), formatPaise(report.byMethod.prepaid.net)],
              ["Delivered", report.outcomes.cod.delivered, report.outcomes.prepaid.delivered],
              ["In transit", report.outcomes.cod.inTransit, report.outcomes.prepaid.inTransit],
              ["Returned (RTO)", report.outcomes.cod.rto, report.outcomes.prepaid.rto],
              ["Cancelled after confirming", report.outcomes.cod.cancelled, report.outcomes.prepaid.cancelled],
              [
                <strong key="r">RTO rate</strong>,
                <strong key="c">
                  {report.outcomes.cod.rtoRate === null ? "—" : `${report.outcomes.cod.rtoRate}%`}
                </strong>,
                <strong key="p">
                  {report.outcomes.prepaid.rtoRate === null ? "—" : `${report.outcomes.prepaid.rtoRate}%`}
                </strong>,
              ],
            ]}
          />
        </Card>

        <Card title="Customers">
          <Table
            head={["Type", "Customers"]}
            rows={[
              ["First-time buyers", report.customers.new],
              ["Returning buyers", report.customers.returning],
              [<strong key="t">Total</strong>, <strong key="v">{report.customers.total}</strong>],
            ]}
          />
          <p className="mt-3 text-xs text-muted">
            Website orders: {report.funnel.checkouts} · online payment still pending: {report.funnel.abandoned} · unpaid
            and cancelled: {report.funnel.unpaidCancelled}.{" "}
            <Link href="/admin/checkouts" className="text-brand underline">
              Abandoned checkouts
            </Link>
          </p>
        </Card>

        <Card title="Traffic sources" description="From the UTM tags on your ad links (utm_source / utm_campaign).">
          {report.bySource.length === 0 ? (
            <p className="text-sm text-muted">No sales in this period.</p>
          ) : (
            <Table
              head={["Source", "Campaign", "Orders", "Sales"]}
              rows={report.bySource.map((r) => [r.source, r.campaign, r.orders, formatPaise(r.net)])}
            />
          )}
        </Card>

        <Card title="Top states">
          {report.byState.length === 0 ? (
            <p className="text-sm text-muted">No sales in this period.</p>
          ) : (
            <Table
              head={["State", "Orders", "Sales"]}
              rows={report.byState.map((r) => [r.state, r.orders, formatPaise(r.net)])}
            />
          )}
        </Card>

        {report.cancelReasons.length > 0 && (
          <Card title="Why orders were cancelled">
            <Table head={["Reason", "Orders"]} rows={report.cancelReasons.map((r) => [r.reason, r.orders])} />
          </Card>
        )}
      </div>

      <p className="text-xs text-muted">
        Visits and conversion rate come from your ads tools: Meta Events Manager (Pixel + Conversions API) shows views,
        add-to-carts and purchases per campaign.
      </p>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[16rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className={cn("px-1 py-2 font-semibold", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={cn("px-1 py-2", j > 0 && "text-right tabular-nums")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
