import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Package, Plus } from "lucide-react";
import { Card, EmptyState, Notice, PageHeader } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/layout";
import { product } from "@/config/products";
import { requireAdmin } from "@/lib/auth/dal";
import { listPacksAdmin } from "@/lib/catalog/admin";
import { discountPercent } from "@/lib/catalog/types";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

function StockCell({ track, stock, threshold }: { track: boolean; stock: number; threshold: number }) {
  if (!track) return <span className="text-muted">Not tracked</span>;
  return (
    <span className={cn("font-semibold", stock <= 0 ? "text-danger" : stock <= threshold ? "text-warn" : "")}>
      {stock < 0 ? `Oversold (${stock})` : stock === 0 ? "Sold out" : `${stock.toLocaleString("en-IN")} in stock`}
    </span>
  );
}

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const user = await requireAdmin();
  const [rows, sp] = await Promise.all([listPacksAdmin(), searchParams]);
  const isOwner = user.role === "owner";

  return (
    <div className="space-y-4">
      {sp.deleted && <Notice tone="success">Pack deleted.</Notice>}
      <PageHeader
        title="Products"
        description={`${product.name}: the packs (variants) customers can buy. Changes show on the store immediately.`}
        actions={
          <>
            <a
              href={`/products/${product.slug}`}
              target="_blank"
              rel="noopener"
              className={buttonClasses("outline", "sm")}
            >
              <ExternalLink className="size-4" /> View on store
            </a>
            {isOwner && (
              <Link href="/admin/products/new" className={buttonClasses("primary", "sm")}>
                <Plus className="size-4" /> Add pack
              </Link>
            )}
          </>
        }
      />

      <Card bodyClassName="p-0 sm:p-0">
        {rows.length === 0 ? (
          <EmptyState icon={Package} title="No packs yet" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(({ pack, sold30 }) => (
              <li key={pack.id}>
                <Link
                  href={`/admin/products/${encodeURIComponent(pack.id)}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface sm:px-5"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-sm font-extrabold">
                    ×{pack.count}
                  </span>
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{pack.name}</span>
                      {pack.status === "hidden" && <Badge tone="neutral">Hidden</Badge>}
                      {pack.productSlug !== product.slug && <Badge tone="neutral">{pack.productSlug}</Badge>}
                      {pack.badge && <Badge tone="brand">{pack.badge}</Badge>}
                    </span>
                    <span className="block text-xs text-muted">
                      {pack.sku} · {pack.count} pcs · {sold30} sold in 30 days
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    <span className="block font-bold">{formatPaise(pack.price)}</span>
                    {pack.mrp > pack.price && (
                      <span className="block text-xs text-muted">
                        MRP {formatPaise(pack.mrp)} · {discountPercent(pack)}% off
                      </span>
                    )}
                  </span>
                  <span className="w-full text-sm sm:w-36 sm:text-right">
                    <StockCell track={pack.trackInventory} stock={pack.stock} threshold={pack.lowStockThreshold} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Product page content">
        <p className="text-sm text-muted">
          The product description, photos, uses, how-to steps and FAQs are part of the website&apos;s code (tuned for
          Google and fast loading), in <code className="text-ink">src/config/products.ts</code> and{" "}
          <code className="text-ink">src/config/faq.ts</code>. Packs, prices, stock and visibility are managed here.
        </p>
      </Card>
    </div>
  );
}
