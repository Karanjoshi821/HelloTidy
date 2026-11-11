import Link from "next/link";
import { formatDateTime } from "@/lib/utils";
import { describeEvent, formatDuration, pageName, sourceLabel } from "@/lib/visitors/format";
import { placeLabel } from "@/lib/visitors/location";
import { getOrderVisit } from "@/lib/visitors/reports";
import { Card } from "./ui";

/** "How they found us": the visit an order was placed in and, if the buyer accepted cookies, the visits before it. */
export async function OrderVisitCard({
  order,
  className,
}: {
  order: { visitId: string | null; visitorId: string | null; createdAt: Date; source: string };
  className?: string;
}) {
  if (order.source !== "web") return null;
  const found = await getOrderVisit(order);
  if (!found) {
    return (
      <Card title="How they found us" className={className}>
        <p className="text-sm text-muted">
          No visit recorded for this order (placed before visitor tracking, or the browser blocked it).
        </p>
      </Card>
    );
  }
  const { visitor, visit, visitsBefore, pageviewsBefore, engagedBefore, steps } = found;
  const known = !visitor.anonymous;
  const firstToOrder = order.createdAt.getTime() - visitor.firstSeenAt.getTime();

  return (
    <Card
      title="How they found us"
      className={className}
      actions={
        <Link href={`/admin/visitors/${visitor.id}`} className="text-sm font-semibold text-brand underline">
          Full timeline
        </Link>
      }
    >
      <dl className="space-y-1.5 text-sm">
        {known && (
          <Row
            label="First came from"
            value={`${sourceLabel(visitor.source, visitor.medium)}${visitor.campaign ? ` (${visitor.campaign})` : ""}`}
          />
        )}
        {visit && (
          <Row
            label={known ? "This visit from" : "Came from"}
            value={`${sourceLabel(visit.source, visit.medium)}${visit.campaign ? ` (${visit.campaign})` : ""}`}
          />
        )}
        {visit && <Row label="Landed on" value={pageName(visit.landingPage)} />}
        {known ? (
          <>
            <Row label="Visits before ordering" value={String(visitsBefore)} />
            <Row label="Pages viewed" value={`${pageviewsBefore} · ${formatDuration(engagedBefore)}`} />
            <Row
              label="First visit"
              value={`${formatDateTime(visitor.firstSeenAt)} (${formatDuration(firstToOrder / 1000)} before)`}
            />
          </>
        ) : (
          visit && (
            <Row label="This visit" value={`${visit.pageviews} pages · ${formatDuration(visit.engagedSeconds)}`} />
          )
        )}
        <Row
          label="Device"
          value={[visitor.deviceModel, visitor.os, visitor.browser].filter(Boolean).join(" · ") || "Unknown"}
        />
        {visit && <Row label="Place (network)" value={placeLabel(visit)} />}
      </dl>
      {steps.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">What they did in this visit ({steps.length})</summary>
          <ol className="mt-2 space-y-1 text-xs">
            {steps.map((st, i) => (
              <li key={i} className={st.type === "view" ? "text-muted" : "font-semibold"}>
                {describeEvent(st.type, st.data, st.path)}
                {st.type === "view" && st.seconds > 0 ? ` · ${formatDuration(st.seconds)}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}
      {!known && <p className="mt-3 text-xs text-muted">The buyer declined cookies, so only this visit is known.</p>}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
