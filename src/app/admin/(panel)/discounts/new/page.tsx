import type { Metadata } from "next";
import { createDiscountAction } from "@/app/admin/discount-actions";
import { DiscountForm } from "@/components/admin/discount-form";
import { PageHeader } from "@/components/admin/ui";
import { requireOwner } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Create discount" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function NewDiscountPage() {
  await requireOwner();
  return (
    <div className="max-w-3xl">
      <PageHeader back={{ href: "/admin/discounts", label: "Discounts" }} title="Create discount code" />
      <DiscountForm
        action={createDiscountAction}
        submitLabel="Create code"
        values={{
          code: "",
          description: "",
          type: "percent",
          percent: "10",
          amount: "",
          minOrder: "",
          maxDiscount: "",
          startsAt: "",
          endsAt: "",
          usageLimit: "",
          oncePerCustomer: false,
          active: true,
        }}
      />
    </div>
  );
}
