import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeviceIcon } from "@/components/admin/live-visitors";
import { StatusBadge } from "@/components/admin/status";
import { Card, DefinitionList, PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/layout";
import { requireOwner } from "@/lib/auth/dal";
import { formatPaise } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { describeEvent, formatDuration, pageName, sourceLabel } from "@/lib/visitors/format";
import { placeLabel } from "@/lib/visitors/location";
import { getVisitorDetail } from "@/lib/visitors/reports";

export const metadata: Metadata = { title: "Visitor" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function VisitorPage({ params }: PageProps<"/admin/visitors/[id]">) {
  await requireOwner();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getVisitorDetail(id);
  if (!detail) notFound();
  const { visitor: v, customerName, customerPhone, sessions, events, orders } = detail;
  const eventsBySession = new Map<string, typeof events>();
  for (const ev of events) {
    const list = eventsBySession.get(ev.sessionId) ?? [];
    list.push(ev);
    eventsBySession.set(ev.sessionId, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/visitors/all", label: "Visitor list" }}
        title={customerName ?? `Visitor ${v.id.slice(0, 6)}`}
        badges={
          <>
            {orders.length > 0 && <Badge tone="success">Bought</Badge>}
            {v.anonymous ? <Badge tone="neutral">Anonymous</Badge> : <Badge tone="brand">Accepted cookies</Badge>}
          </>
        }
        description={
          v.anonymous
            ? "Declined (or didn't answer) the cookie banner: this is one visit, with no cookie or IP address."
            : `Accepted cookies ${v.consentAt ? formatDateTime(v.consentAt) : ""}. Visits from this browser are linked.`
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-6">
          {sessions.length === 0 && (
            <Card>
              <p className="text-sm text-muted">No visits kept (older visits are deleted after 12 months).</p>
            </Card>
          )}
          {sessions.map((session, i) => {
            const list = eventsBySession.get(session.id) ?? [];
            const order = orders.find((o) => o.visitId === session.id);
            return (
              <Card
                key={session.id}
                title={`Visit ${sessions.length - i}: ${formatDateTime(session.startedAt)}`}
                description={`${sourceLabel(session.source, session.medium)}${session.campaign ? ` (${session.campaign})` : ""} · ${session.pageviews} page${session.pageviews === 1 ? "" : "s"} · ${formatDuration(session.engagedSeconds)} · ${placeLabel(session)}`}
              >
                {session.referrer && <p className="mb-3 text-xs break-all text-muted">Referrer: {session.referrer}</p>}
                <ol className="relative space-y-2 border-l-2 border-line pl-4 text-sm">
                  {list.map((ev) => (
                    <li key={ev.id} className="relative">
                      <span
                        className={`absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full ${ev.type === "view" ? "bg-line" : ev.type === "order_placed" ? "bg-success" : "bg-brand"}`}
                        aria-hidden="true"
                      />
                      <span className={ev.type === "view" ? "" : "font-semibold"}>
                        {describeEvent(ev.type, ev.data, ev.path)}
                      </span>
                      <span className="ml-2 text-xs whitespace-nowrap text-muted">
                        {new Date(ev.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Kolkata",
                        })}
                        {ev.type === "view" && ev.seconds > 0 ? ` · ${formatDuration(ev.seconds)}` : ""}
                      </span>
                    </li>
                  ))}
                  {list.length === 0 && <li className="text-muted">No pages recorded.</li>}
                </ol>
                {order && (
                  <p className="mt-3 text-sm">
                    Order{" "}
                    <Link href={`/admin/orders/${order.id}`} className="font-mono font-semibold text-brand underline">
                      {order.orderNumber}
                    </Link>{" "}
                    placed in this visit.
                  </p>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-6">
          <Card title="Visitor">
            <DefinitionList
              items={[
                { label: "First seen", value: formatDateTime(v.firstSeenAt) },
                { label: "Last seen", value: formatDateTime(v.lastSeenAt) },
                { label: "Visits", value: v.visitCount },
                { label: "Pages", value: v.pageviews },
                { label: "Time on site", value: formatDuration(v.engagedSeconds) },
                { label: "First came from", value: sourceLabel(v.source, v.medium) },
                ...(v.campaign ? [{ label: "Campaign", value: v.campaign }] : []),
                { label: "Landing page", value: pageName(v.landingPage) },
              ]}
            />
          </Card>
          <Card title="Device and place">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold capitalize">
              <DeviceIcon type={v.deviceType} className="size-4 text-muted" /> {v.deviceType ?? "Unknown"}
            </p>
            <DefinitionList
              items={[
                ...(v.deviceModel ? [{ label: "Model", value: v.deviceModel }] : []),
                { label: "System", value: v.os ?? "-" },
                { label: "Browser", value: v.browser ?? "-" },
                ...(v.screen ? [{ label: "Screen", value: v.screen }] : []),
                ...(v.language ? [{ label: "Language", value: v.language }] : []),
                { label: "Place", value: placeLabel(v) },
                ...(v.postalCode ? [{ label: "PIN area", value: v.postalCode }] : []),
                ...(v.ip ? [{ label: "IP", value: <span className="font-mono text-xs">{v.ip}</span> }] : []),
              ]}
            />
            <p className="mt-3 text-xs text-muted">
              Place is estimated from the network (Vercel), so it may be a nearby city.
            </p>
          </Card>
          {(customerName || orders.length > 0) && (
            <Card title="Orders">
              {customerName && v.customerId && (
                <p className="mb-2 text-sm">
                  <Link href={`/admin/customers/${v.customerId}`} className="font-semibold text-brand underline">
                    {customerName}
                  </Link>
                  {customerPhone ? <span className="text-muted"> · +91 {customerPhone}</span> : null}
                </p>
              )}
              <ul className="space-y-2 text-sm">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-brand underline">
                      {o.orderNumber}
                    </Link>
                    <span className="flex items-center gap-2">
                      {formatPaise(o.total)} <StatusBadge status={o.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
