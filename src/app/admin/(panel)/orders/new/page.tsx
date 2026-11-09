import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { CreateOrderForm, type StaffPack } from "@/components/admin/create-order-form";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/dal";
import { listPacksAdmin } from "@/lib/catalog/admin";
import { readCheckoutSettings } from "@/lib/catalog/service";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Create order" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

export default async function CreateOrderPage() {
  const user = await requireAdmin();
  const [rows, settings] = await Promise.all([listPacksAdmin(), getDb().then(readCheckoutSettings)]);
  const packs: StaffPack[] = rows.map(({ pack }) => ({
    id: pack.id,
    sku: pack.sku,
    name: pack.name,
    count: pack.count,
    price: pack.price,
    mrp: pack.mrp,
    available: !pack.trackInventory || pack.stock > 0,
    hidden: pack.status === "hidden",
    stock: pack.trackInventory ? pack.stock : null,
  }));

  return (
    <div>
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        title="Create order"
        description="For orders taken on the phone or WhatsApp. Same prices and stock as the website; bulk quantities allowed."
      />
      <CreateOrderForm
        packs={packs}
        codFee={settings.codFee}
        codMaxOrderValue={settings.codMaxOrderValue}
        formKey={randomUUID()}
        canDiscount={user.role === "owner"}
      />
    </div>
  );
}
