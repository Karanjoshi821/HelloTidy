import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adjustStockAction, deletePackAction, updatePackAction } from "@/app/admin/product-actions";
import { ActionForm } from "@/components/admin/action-form";
import { PackForm } from "@/components/admin/pack-form";
import { adminInput, adminSelect, Card, DefinitionList, Notice, PageHeader } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/layout";
import { product } from "@/config/products";
import { requireAdmin } from "@/lib/auth/dal";
import { getPackAdmin, STOCK_REASONS } from "@/lib/catalog/admin";
import { formatPaise } from "@/lib/money";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Pack" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

const REASON_LABELS: Record<string, string> = {
  ...STOCK_REASONS,
  order: "Order",
  cancelled: "Order cancelled",
};

export default async function PackPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const user = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await getPackAdmin(decodeURIComponent(id));
  if (!detail) notFound();
  const { pack, movements, sold30, orderCount, unitsAllTime } = detail;
  const isOwner = user.role === "owner";

  return (
    <div className="space-y-6">
      {sp.created && <Notice tone="success">Pack added.</Notice>}
      <PageHeader
        back={{ href: "/admin/products", label: "Products" }}
        title={pack.name}
        badges={
          <>
            <Badge tone={pack.status === "active" ? "success" : "neutral"}>
              {pack.status === "active" ? "On sale" : "Hidden"}
            </Badge>
            {pack.trackInventory && pack.stock <= 0 && (
              <Badge tone="danger">{pack.stock < 0 ? "Oversold" : "Sold out"}</Badge>
            )}
          </>
        }
        description={`${pack.sku} · ${pack.count} pcs · ${formatPaise(pack.price)}`}
        actions={
          pack.status === "active" && pack.productSlug === product.slug ? (
            <a
              href={`/products/${product.slug}?pack=${encodeURIComponent(pack.id)}`}
              target="_blank"
              rel="noopener"
              className={buttonClasses("outline", "sm")}
            >
              View on store
            </a>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {isOwner ? (
            <PackForm action={updatePackAction} pack={pack} submitLabel="Save pack" />
          ) : (
            <Card title="Details" description="Only the owner can change prices and details.">
              <DefinitionList
                items={[
                  { label: "Price", value: formatPaise(pack.price) },
                  { label: "MRP", value: formatPaise(pack.mrp) },
                  { label: "Pieces", value: pack.count },
                  { label: "Shipping weight", value: `${pack.weightGrams} g` },
                  { label: "Stock tracking", value: pack.trackInventory ? "On" : "Off" },
                ]}
              />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Stock">
            <p
              className={cn(
                "text-3xl font-extrabold",
                pack.trackInventory && pack.stock <= pack.lowStockThreshold && "text-warn",
                pack.trackInventory && pack.stock <= 0 && "text-danger",
              )}
            >
              {pack.stock.toLocaleString("en-IN")}
            </p>
            <p className="text-sm text-muted">
              {pack.trackInventory
                ? `On hand · alert at ${pack.lowStockThreshold}`
                : "Not tracked: the pack never shows as out of stock."}
            </p>
            <ActionForm action={adjustStockAction} resetOnSuccess className="mt-4 grid gap-3">
              <input type="hidden" name="id" value={pack.id} />
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <select name="direction" defaultValue="add" className={adminSelect} aria-label="Add or remove">
                  <option value="add">Add</option>
                  <option value="remove">Remove</option>
                </select>
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={1000000}
                  required
                  placeholder="Quantity"
                  className={adminInput}
                  aria-label="Quantity"
                />
              </div>
              <select name="reason" defaultValue="received" className={adminSelect} aria-label="Reason">
                {Object.entries(STOCK_REASONS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                name="note"
                maxLength={200}
                placeholder="Note (optional), e.g. supplier invoice no."
                className={adminInput}
                aria-label="Note"
              />
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Adjust stock
              </button>
            </ActionForm>
          </Card>

          <Card title="Sales">
            <DefinitionList
              items={[
                { label: "Sold, last 30 days", value: `${sold30} units` },
                { label: "Sold, all time", value: `${unitsAllTime} units` },
                { label: "Orders with this pack", value: orderCount },
              ]}
            />
          </Card>

          <Card title="Stock history" bodyClassName="p-0 sm:p-0">
            {movements.length === 0 ? (
              <p className="p-4 text-sm text-muted sm:p-5">No stock changes yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {movements.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
                    <span className={cn("w-14 shrink-0 font-bold", m.delta > 0 ? "text-success" : "text-danger")}>
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </span>
                    <span className="min-w-0 flex-1">
                      {REASON_LABELS[m.reason] ?? m.reason}
                      {m.note && <span className="text-muted"> · {m.note}</span>}
                      <span className="block text-xs text-muted">
                        {formatDateTime(m.createdAt)} · {m.actor}
                      </span>
                    </span>
                    <span className="text-muted">= {m.stockAfter}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {isOwner && orderCount === 0 && (
            <Card title="Delete pack">
              <ActionForm action={deletePackAction} confirm={`Delete ${pack.name}? This can't be undone.`}>
                <input type="hidden" name="id" value={pack.id} />
                <p className="mb-3 text-sm text-muted">Only packs that were never ordered can be deleted.</p>
                <button type="submit" className={buttonClasses("outline", "sm", "border-danger/40 text-danger")}>
                  Delete pack
                </button>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
