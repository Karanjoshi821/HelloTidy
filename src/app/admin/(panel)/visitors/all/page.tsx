import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Eye } from "lucide-react";
import { DeviceIcon } from "@/components/admin/live-visitors";
import { EmptyState, listHref, PageHeader, Pagination, param, Tabs } from "@/components/admin/ui";
import { Badge } from "@/components/ui/layout";
import { requireOwner } from "@/lib/auth/dal";
import { ago, formatDuration, sourceLabel } from "@/lib/visitors/format";
import { placeLabel } from "@/lib/visitors/location";
import { listVisitors, VISITOR_FILTERS } from "@/lib/visitors/reports";
import { pruneVisitorData } from "@/lib/visitors/service";

export const metadata: Metadata = { title: "Visitor list" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function VisitorListPage({ searchParams }: PageProps<"/admin/visitors/all">) {
  await requireOwner();
  after(() => pruneVisitorData());
  const sp = await searchParams;
  const current = { filter: param(sp.filter) };
  const page = Number.parseInt(param(sp.page) ?? "1", 10) || 1;
  const { rows, total, pageCount, filter } = await listVisitors({ ...current, page });
  const now = new Date();

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/admin/visitors", label: "Visitors" }}
        title="Visitor list"
        description="Most recent first. Someone who declined cookies appears once per visit, without a cookie or IP. Kept for 12 months."
      />
      <Tabs
        label="Visitor filters"
        items={Object.entries(VISITOR_FILTERS).map(([key, label]) => ({
          href: listHref("/admin/visitors/all", {}, { filter: key === "all" ? undefined : key }),
          label,
          active: filter === key,
        }))}
      />
      <div className="rounded-2xl bg-white shadow-card">
        {rows.length === 0 ? (
          <EmptyState icon={Eye} title={filter === "all" ? "No visitors yet" : "No visitors match"}>
            Visitors appear here as soon as someone opens the store. Your own visits while signed in to the admin
            aren&apos;t counted.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/admin/visitors/${v.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface sm:px-5"
                >
                  <DeviceIcon type={v.deviceType} className="size-5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{v.customerName ?? `Visitor ${v.id.slice(0, 6)}`}</span>
                      {v.bought && <Badge tone="success">Bought</Badge>}
                      {v.anonymous ? (
                        <span className="text-xs text-muted">anonymous</span>
                      ) : (
                        v.visitCount > 1 && <Badge tone="brand">{v.visitCount} visits</Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {placeLabel(v)} ·{" "}
                      {[v.deviceModel, v.os, v.browser].filter(Boolean).join(" · ") || "Unknown device"}
                    </span>
                  </span>
                  <span className="text-xs text-muted sm:w-40">
                    Came from <span className="font-semibold text-ink">{sourceLabel(v.source, v.medium)}</span>
                    {v.campaign ? ` (${v.campaign})` : ""}
                  </span>
                  <span className="text-xs text-muted sm:w-36 sm:text-right">
                    {v.pageviews} page{v.pageviews === 1 ? "" : "s"} · {formatDuration(v.engagedSeconds)}
                    <br />
                    {ago(v.lastSeenAt, now)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        noun={["visitor", "visitors"]}
        href={(p) => listHref("/admin/visitors/all", current, { page: p })}
      />
    </div>
  );
}
