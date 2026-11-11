import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDiscountAction, toggleDiscountAction, updateDiscountAction } from "@/app/admin/discount-actions";
import { ActionForm } from "@/components/admin/action-form";
import { FlashToast } from "@/components/admin/toaster";
import { DiscountStateBadge } from "@/components/admin/discount-badge";
import { DiscountForm } from "@/components/admin/discount-form";
import { StatusBadge } from "@/components/admin/status";
import { Card, PageHeader, StatCard } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth/dal";
import { describeDiscount, getDiscountAdmin } from "@/lib/discounts/admin";
import { toIstInputValue } from "@/lib/form";
import { formatPaise } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Discount" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function DiscountPage({ params }: PageProps<"/admin/discounts/[id]">) {
  await requireOwner();
  const { id } = await params;
  const detail = await getDiscountAdmin(id);
  if (!detail) notFound();
  const { discount: d, uses, revenue, discounted, recent, state } = detail;
  const used = recent.length > 0;

  return (
    <div className="space-y-6">
      <FlashToast
        param="created"
        message={`Code created. Customers can use it ${state === "active" ? "right away" : "once it's active"}.`}
      />
      <PageHeader
        back={{ href: "/admin/discounts", label: "Discounts" }}
        title={<span className="font-mono">{d.code}</span>}
        badges={<DiscountStateBadge state={state} />}
        description={describeDiscount(d)}
        actions={
          <ActionForm action={toggleDiscountAction}>
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="active" value={d.active ? "false" : "true"} />
            <button type="submit" className={buttonClasses(d.active ? "outline" : "primary", "sm")}>
              {d.active ? "Disable" : "Enable"}
            </button>
          </ActionForm>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Uses" value={`${uses}${d.usageLimit !== null ? ` / ${d.usageLimit}` : ""}`} />
        <StatCard label="Sales with code" value={formatPaise(revenue)} />
        <StatCard label="Discount given" value={formatPaise(discounted)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <DiscountForm
          action={updateDiscountAction}
          submitLabel="Save"
          locked={used}
          values={{
            id: d.id,
            code: d.code,
            description: d.description,
            type: d.type,
            percent: d.type === "percent" ? String(d.value) : "",
            amount: d.type === "flat" ? String(d.value / 100) : "",
            minOrder: d.minOrder ? String(d.minOrder / 100) : "",
            maxDiscount: d.maxDiscount !== null ? String(d.maxDiscount / 100) : "",
            startsAt: toIstInputValue(d.startsAt),
            endsAt: toIstInputValue(d.endsAt),
            usageLimit: d.usageLimit !== null ? String(d.usageLimit) : "",
            oncePerCustomer: d.oncePerCustomer,
            active: d.active,
          }}
        />
        <div className="space-y-6">
          <Card title="Recent orders" bodyClassName="p-0 sm:p-0">
            {recent.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">Not used yet.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line text-sm">
                {recent.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-surface sm:px-5"
                    >
                      <span className="font-mono font-semibold text-brand">{o.orderNumber}</span>
                      <StatusBadge status={o.status} />
                      <span className="ml-auto font-semibold">−{formatPaise(o.discount)}</span>
                      <span className="w-full text-xs text-muted">
                        {o.customerName} · {formatDateTime(o.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {!used && (
            <Card title="Delete code">
              <ActionForm action={deleteDiscountAction} confirm={`Delete ${d.code}?`}>
                <input type="hidden" name="id" value={d.id} />
                <p className="mb-3 text-sm text-muted">Codes that were used on orders can only be disabled.</p>
                <button type="submit" className={buttonClasses("outline", "sm", "border-danger/40 text-danger")}>
                  Delete code
                </button>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
