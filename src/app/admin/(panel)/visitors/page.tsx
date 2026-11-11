import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Users } from "lucide-react";
import { BarChart, shortLabel } from "@/components/admin/bar-chart";
import { DataTable } from "@/components/admin/data-table";
import { Funnel } from "@/components/admin/funnel";
import { LiveVisitors } from "@/components/admin/live-visitors";
import { adminInput, Card, PageHeader, percentChange, StatCard } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth/dal";
import { addDays, istYmd, parseIstRange, startOfIndianDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EVENT_LABELS, formatDuration, pageName, sourceLabel } from "@/lib/visitors/format";
import { getLiveVisitors, getTrafficOverview } from "@/lib/visitors/reports";
import { pruneVisitorData } from "@/lib/visitors/service";

export const metadata: Metadata = { title: "Visitors" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

const PRESETS = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "-");
const n = (value: number) => value.toLocaleString("en-IN");

export default async function VisitorsPage({ searchParams }: PageProps<"/admin/visitors">) {
  await requireOwner();
  after(() => pruneVisitorData());
  const sp = await searchParams;
  const range = parseIstRange(
    typeof sp.from === "string" ? sp.from : undefined,
    typeof sp.to === "string" ? sp.to : undefined,
    7,
    366,
  );
  const [report, live] = await Promise.all([getTrafficOverview(range), getLiveVisitors()]);
  const { current: c, previous: p, funnel } = report;
  const today = istYmd(startOfIndianDay(0));
  const period =
    range.fromYmd === range.toYmd
      ? shortLabel(range.fromYmd)
      : `${shortLabel(range.fromYmd)} – ${shortLabel(range.toYmd)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visitors"
        description={`${period} (${range.days} day${range.days === 1 ? "" : "s"}), compared with the ${range.days} days before. From our own tracker; bots and staff aren't counted.`}
        actions={
          <Link href="/admin/visitors/all" className={buttonClasses("outline", "sm")}>
            <Users className="size-4" /> Visitor list
          </Link>
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <nav aria-label="Date range" className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const from = istYmd(addDays(startOfIndianDay(0), -(preset.days - 1)));
            const active = range.fromYmd === from && range.toYmd === today;
            return (
              <Link
                key={preset.days}
                href={`/admin/visitors?from=${from}&to=${today}`}
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
        <form action="/admin/visitors" className="flex flex-wrap items-end gap-2">
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

      <Card title="Live" description="Active in the last 5 minutes. Updates every 15 seconds.">
        <LiveVisitors initial={live} />
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Visits"
          value={n(c.visits)}
          change={percentChange(c.visits, p.visits)}
          hint="Sessions; a new one after 30 min idle"
        />
        <StatCard
          label="Page views"
          value={n(c.pageviews)}
          change={percentChange(c.pageviews, p.pageviews)}
          hint={c.visits ? `${(c.pageviews / c.visits).toFixed(1)} per visit` : undefined}
        />
        <StatCard
          label="Time on site"
          value={formatDuration(c.avgEngagedSeconds)}
          change={percentChange(c.avgEngagedSeconds, p.avgEngagedSeconds)}
          hint="Average per visit, while reading"
        />
        <StatCard
          label="Bounce rate"
          value={c.bounceRate === null ? "-" : `${c.bounceRate}%`}
          hint="One page, under 10 seconds"
        />
        <StatCard
          label="Orders from visits"
          value={n(c.ordered)}
          change={percentChange(c.ordered, p.ordered)}
          hint="Placed on the website"
        />
        <StatCard
          label="Conversion rate"
          value={c.conversionRate === null ? "-" : `${c.conversionRate}%`}
          hint={p.conversionRate === null ? "Visits that ordered" : `Was ${p.conversionRate}%`}
        />
      </div>

      <Card title="Visits by day">
        <BarChart
          data={report.series.map((d) => ({ label: d.label, short: shortLabel(d.label), value: d.value }))}
          format={(v) => `${n(v)} visit${v === 1 ? "" : "s"}`}
          caption="Visits by day"
          emptyText="No visits in this period yet"
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card title="Sales funnel" description="How far visits got. Each step counts visits that reached it.">
          <Funnel
            steps={[
              { label: "Visited the store", value: funnel.visits },
              { label: "Saw the product page", value: funnel.product },
              { label: "Added to cart or Buy now", value: funnel.cart },
              { label: "Reached checkout", value: funnel.checkout },
              { label: "Placed an order", value: funnel.ordered },
            ]}
          />
        </Card>

        <Card
          title="Where visits came from"
          description="UTM tags first, then ad click ids, then the referring site or app."
        >
          <DataTable
            head={["Source", "Visits", "Orders", "Conv."]}
            rows={report.sources.map((r) => [
              sourceLabel(r.source, r.medium || null),
              n(Number(r.visits)),
              n(r.ordered),
              pct(r.ordered, Number(r.visits)),
            ])}
            empty="No visits in this period."
          />
        </Card>

        {report.campaigns.length > 0 && (
          <Card title="Campaigns" description="From utm_campaign on your ad links.">
            <DataTable
              head={["Campaign", "Visits", "Orders"]}
              rows={report.campaigns.map((r) => [`${r.campaign} (${r.source})`, n(Number(r.visits)), n(r.ordered)])}
            />
          </Card>
        )}

        <Card title="Landing pages" description="The first page of each visit.">
          <DataTable
            head={["Page", "Visits", "Bounce", "Orders"]}
            rows={report.landing.map((r) => [
              pageName(r.path),
              n(Number(r.visits)),
              pct(r.bounced, Number(r.visits)),
              n(r.ordered),
            ])}
            empty="No visits in this period."
          />
        </Card>

        <Card title="Top pages">
          <DataTable
            head={["Page", "Views", "Visits", "Avg time"]}
            rows={report.topPages.map((r) => [
              pageName(r.path),
              n(Number(r.views)),
              n(r.visits),
              formatDuration(r.avgSeconds),
            ])}
            empty="No page views in this period."
          />
        </Card>

        <Card title="Exit pages" description="The last page before people left.">
          <DataTable
            head={["Page", "Visits"]}
            rows={report.exits.map((r) => [pageName(r.path), n(Number(r.visits))])}
            empty="No visits in this period."
          />
        </Card>

        <Card title="What visitors did">
          <DataTable
            head={["Action", "Times", "Visits"]}
            rows={report.actions.map((r) => [EVENT_LABELS[r.type] ?? r.type, n(Number(r.times)), n(r.visits)])}
            empty="No actions in this period."
          />
          {report.pins.checks > 0 && (
            <p className="mt-3 text-xs text-muted">
              PIN checks:{" "}
              {[
                `${report.pins.serviceable} deliverable`,
                report.pins.notServiceable ? `${report.pins.notServiceable} not deliverable` : null,
                report.pins.checks - report.pins.serviceable - report.pins.notServiceable
                  ? `${report.pins.checks - report.pins.serviceable - report.pins.notServiceable} couldn't be checked`
                  : null,
                report.pins.noCod ? `${report.pins.noCod} without COD` : null,
              ]
                .filter(Boolean)
                .join(", ")}
              .
            </p>
          )}
        </Card>

        {report.packs.length > 0 && (
          <Card title="Packs" description="Picked on the product page, and added to cart (or Buy now).">
            <DataTable
              head={["Pack", "Picked", "Added"]}
              rows={report.packs.map((r) => [r.pack ?? "?", n(r.picked), n(r.carted)])}
            />
          </Card>
        )}

        <Card title="Devices">
          <DataTable
            head={["Device", "Visits", "Share"]}
            rows={report.devices.map((r) => [
              <span key="d" className="capitalize">
                {r.label}
              </span>,
              n(Number(r.visits)),
              pct(Number(r.visits), c.visits),
            ])}
            empty="No visits in this period."
          />
          {(report.browsers.length > 0 || report.systems.length > 0) && (
            <p className="mt-3 text-xs text-muted">
              Browsers: {report.browsers.map((b) => `${b.label} ${n(Number(b.visits))}`).join(", ")}.
              <br />
              Systems: {report.systems.map((b) => `${b.label} ${n(Number(b.visits))}`).join(", ")}.
            </p>
          )}
        </Card>

        <Card title="States" description="From the visitor's network, so approximate.">
          <DataTable
            head={["State", "Visits", "Orders"]}
            rows={report.states.map((r) => [r.label, n(Number(r.visits)), n(r.ordered)])}
            empty="No visits in this period."
          />
        </Card>

        <Card title="Cities" description="Approximate; mobile networks often show a nearby big city.">
          <DataTable
            head={["City", "Visits"]}
            rows={report.cities.map((r) => [r.region ? `${r.city}, ${r.region}` : r.city, n(Number(r.visits))])}
            empty="No locations yet. They appear on the live site (Vercel adds them)."
          />
        </Card>

        <Card title="Cookie choice">
          <p className="text-sm">
            <strong>{pct(report.consent.accepted, report.consent.visits)}</strong> of visits accepted cookies (
            {n(report.consent.accepted)} of {n(report.consent.visits)}).
          </p>
          <p className="mt-2 text-xs text-muted">
            Without consent a visit is counted anonymously and can&apos;t be linked to earlier ones, so
            &quot;returning&quot; ({n(c.returning)} visits) only counts people who accepted. Google Analytics, Clarity
            and Meta only see visitors who accepted.
          </p>
        </Card>
      </div>
    </div>
  );
}
