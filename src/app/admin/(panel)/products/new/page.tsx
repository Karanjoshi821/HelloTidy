import type { Metadata } from "next";
import { createPackAction } from "@/app/admin/product-actions";
import { PackForm } from "@/components/admin/pack-form";
import { PageHeader } from "@/components/admin/ui";
import { requireOwner } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Add pack" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function NewPackPage() {
  await requireOwner();
  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: "/admin/products", label: "Products" }}
        title="Add pack"
        description="A new pack size of the product. Tip: add it as Hidden, check it, then put it on sale."
      />
      <PackForm action={createPackAction} submitLabel="Add pack" />
    </div>
  );
}
