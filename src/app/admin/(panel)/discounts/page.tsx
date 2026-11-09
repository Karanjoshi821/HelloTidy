import type { Metadata } from "next";
import Link from "next/link";
import { Plus, TicketPercent } from "lucide-react";
import { DiscountStateBadge } from "@/components/admin/discount-badge";
import { Card, EmptyState, Notice, PageHeader } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth/dal";
import { describeDiscount, listDiscountsAdmin } from "@/lib/discounts/admin";
import { formatPaise } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Discounts" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function DiscountsPage({ searchParams }: PageProps<"/admin/discounts">) {
  await requireOwner();
  const [rows, sp] = await Promise.all([listDiscountsAdmin(), searchParams]);

  return (
    <div className="space-y-4">
      {sp.deleted && <Notice tone="success">Discount deleted.</Notice>}
      <PageHeader
        title="Discounts"
        description="Codes customers type at checkout. A use counts once an order goes through; cancelled orders give it back."
        actions={
          <Link href="/admin/discounts/new" className={buttonClasses("primary", "sm")}>
            <Plus className="size-4" /> Create code
          </Link>
        }
      />
      <Card bodyClassName="p-0 sm:p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={TicketPercent}
            title="No discount codes yet"
            action={
              <Link href="/admin/discounts/new" className={buttonClasses("primary", "sm")}>
                Create code
              </Link>
            }
          >
            Codes help with influencer and WhatsApp campaigns. Keep them small: your margin per order is thin.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ discount: d, uses, revenue, discounted, state }) => (
              <li key={d.id}>
                <Link
                  href={`/admin/discounts/${d.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface sm:px-5"
                >
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold">{d.code}</span>
                      <DiscountStateBadge state={state} />
                    </span>
                    <span className="block text-sm text-muted">{describeDiscount(d)}</span>
                    {d.endsAt && <span className="block text-xs text-muted">Ends {formatDateTime(d.endsAt)}</span>}
                  </span>
                  <span className="text-sm">
                    <span className="font-bold">
                      {uses}
                      {d.usageLimit !== null ? ` / ${d.usageLimit}` : ""} uses
                    </span>
                    <span className="block text-xs text-muted">
                      {formatPaise(revenue)} sales · {formatPaise(discounted)} given
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
