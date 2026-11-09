import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { RecoveryButton } from "@/components/admin/recovery-button";
import { Card, EmptyState, PageHeader, Pagination, param } from "@/components/admin/ui";
import { absoluteUrl } from "@/config/site";
import { requireAdmin } from "@/lib/auth/dal";
import { formatPaise } from "@/lib/money";
import { isRecoveryEnabled } from "@/lib/env";
import { listAbandonedCheckouts } from "@/lib/orders/admin";
import { listRecentCartLeads } from "@/lib/recovery/service";
import { formatDateTime } from "@/lib/utils";
import { paymentReminderText, waLink } from "@/lib/whatsapp-templates";

const LEAD_STATUS_LABELS = {
  open: "Waiting for a call",
  called: "Called",
  converted: "Ordered",
  opted_out: "Don't call",
  closed: "Closed",
} as const;

export const metadata: Metadata = { title: "Abandoned checkouts" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function AbandonedCheckoutsPage({ searchParams }: PageProps<"/admin/checkouts">) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Number.parseInt(param(sp.page) ?? "1", 10) || 1;
  const [{ rows, total, pageCount }, leads] = await Promise.all([
    listAbandonedCheckouts(page),
    isRecoveryEnabled() ? listRecentCartLeads() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Abandoned checkouts"
        description="Customers who chose online payment but didn't finish. A friendly WhatsApp reminder with their order link recovers many of these: they can pay, or switch to Cash on Delivery, from the link."
      />
      <Card bodyClassName="p-0 sm:p-0">
        {rows.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No abandoned checkouts">
            Unpaid online checkouts older than 15 minutes show up here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 basis-56">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-mono text-sm font-bold text-brand hover:underline"
                  >
                    {o.orderNumber}
                  </Link>
                  <p className="text-sm font-medium">
                    {o.customerName} <span className="text-muted">· {o.city}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {o.items} item{o.items === 1 ? "" : "s"} · {formatPaise(o.total)} · {formatDateTime(o.createdAt)} ·
                    +91 {o.phone}
                  </p>
                </div>
                <RecoveryButton
                  orderId={o.id}
                  href={waLink(o.phone, paymentReminderText(o, absoluteUrl(`/order/${o.publicToken}`)))}
                  sent={o.reminders}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        noun={["checkout", "checkouts"]}
        href={(p) => `/admin/checkouts?page=${p}`}
      />
      <p className="text-xs text-muted">
        Done chasing one? Cancel it from the order page, or select several on Orders → Awaiting payment and use “Cancel
        unpaid checkouts”.
      </p>
      {leads && (
        <Card
          title="Cart-recovery calls"
          description="Carts left at checkout by customers who agreed to a call. The automation calls them if no order follows."
          bodyClassName="p-0 sm:p-0"
        >
          {leads.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted sm:px-5">No saved carts yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {leads.map((lead) => (
                <li key={lead.id} className="space-y-1 px-4 py-3 text-sm sm:px-5">
                  <p className="flex flex-wrap items-center gap-x-2 font-medium">
                    {lead.name} <span className="text-muted">· +91 {lead.phone}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold">
                      {LEAD_STATUS_LABELS[lead.status]}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {lead.itemsSummary} · {formatPaise(lead.subtotal)} · saved {formatDateTime(lead.createdAt)}
                    {lead.callAttempts > 0 &&
                      ` · ${lead.callAttempts} call${lead.callAttempts === 1 ? "" : "s"}, last: ${lead.lastOutcome ?? "in progress"}`}
                    {lead.couponCode && ` · code ${lead.couponCode}${lead.couponSentAt ? " (sent)" : ""}`}
                  </p>
                  {lead.callSummary && <p className="text-xs">{lead.callSummary}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
