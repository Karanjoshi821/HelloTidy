import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/art";
import { PrintButton } from "@/components/admin/print-button";
import { formattedAddress, isPlaceholder, siteConfig } from "@/config/site";
import { requireAdmin } from "@/lib/auth/dal";
import { formatPaise } from "@/lib/money";
import { getOrdersWithItems } from "@/lib/orders/admin";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Print" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

/**
 * Packing slips (for inside the box: no prices, COD amount to collect) and
 * order receipts. Deliberately not titled "Tax invoice": a GST tax invoice
 * needs a GSTIN, HSN codes and a tax breakup (see DECISIONS.md).
 */
export default async function PrintOrdersPage({ searchParams }: PageProps<"/admin/print/orders">) {
  await requireAdmin();
  const sp = await searchParams;
  const type = sp.type === "receipt" ? "receipt" : "slip";
  const rawIds = typeof sp.ids === "string" ? sp.ids : "";
  const ids = rawIds
    .split(",")
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 100);
  const orders = ids.length ? await getOrdersWithItems({ ids }, 100) : [];
  const business = isPlaceholder(siteConfig.legalName) ? siteConfig.name : siteConfig.legalName;
  const address = isPlaceholder(siteConfig.address.line1) ? null : formattedAddress();
  const support = [
    isPlaceholder(siteConfig.contact.phoneDisplay) ? null : siteConfig.contact.phoneDisplay,
    isPlaceholder(siteConfig.contact.email) ? null : siteConfig.contact.email,
  ].filter(Boolean);
  const query = (t: string) => `/admin/print/orders?ids=${ids.join(",")}&type=${t}`;

  return (
    <div className="flex-1 bg-surface print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-3">
        <Link
          href={ids.length === 1 ? `/admin/orders/${ids[0]}` : "/admin/orders"}
          className="text-sm font-semibold text-muted hover:text-ink"
        >
          ← Back
        </Link>
        <span className="ml-2 text-sm font-semibold">
          {orders.length} order{orders.length === 1 ? "" : "s"}
        </span>
        <nav
          className="ml-auto flex gap-1 rounded-full bg-surface p-1 text-sm font-semibold"
          aria-label="Document type"
        >
          {(["slip", "receipt"] as const).map((t) => (
            <Link
              key={t}
              href={query(t)}
              aria-current={type === t ? "page" : undefined}
              className={cn("rounded-full px-3 py-1", type === t ? "bg-white shadow-card" : "text-muted")}
            >
              {t === "slip" ? "Packing slips" : "Receipts"}
            </Link>
          ))}
        </nav>
        <PrintButton />
      </div>

      <h1 className="sr-only">{type === "slip" ? "Packing slips" : "Order receipts"}</h1>
      {orders.length === 0 && <p className="p-8 text-center text-muted">No orders selected.</p>}

      <div className="mx-auto max-w-[210mm] space-y-6 p-4 print:space-y-0 print:p-0">
        {orders.map((o) => {
          // Slips are for the parcel (what the courier collects); receipts are for the customer.
          const stop = type === "slip" ? shipWarning(o) : null;
          const codDue = type === "slip" && !stop && o.paymentMethod === "cod" && o.paymentStatus !== "paid";
          return (
            <article key={o.id} className="print-sheet rounded-xl bg-white p-8 text-[13px] text-ink shadow-card">
              <header className="flex items-start justify-between gap-6 border-b border-ink pb-4">
                <div className="flex items-center gap-2">
                  <LogoMark className="size-9" />
                  <div>
                    <p className="text-lg font-extrabold">{siteConfig.name}</p>
                    {type === "receipt" && (
                      <p className="text-xs text-muted">
                        {business}
                        {address ? (
                          <>
                            <br />
                            {address}
                          </>
                        ) : null}
                        {siteConfig.gstin ? (
                          <>
                            <br />
                            GSTIN {siteConfig.gstin}
                          </>
                        ) : null}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-extrabold uppercase">
                    {type === "slip" ? "Packing slip" : "Order receipt"}
                  </p>
                  <p className="font-mono font-bold">{o.orderNumber}</p>
                  <p className="text-xs text-muted">{formatDateTime(o.createdAt)}</p>
                </div>
              </header>

              <section className="mt-4 grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-bold text-muted uppercase">{type === "slip" ? "Ship to" : "Bill to"}</p>
                  <p className="mt-1 font-bold">{o.customerName}</p>
                  <p>
                    {[o.address1, o.address2].filter(Boolean).join(", ")}
                    {o.landmark ? (
                      <>
                        <br />
                        Landmark: {o.landmark}
                      </>
                    ) : null}
                    <br />
                    {o.city}, {o.state} - {o.pincode}
                    <br />
                    Phone: +91 {o.phone}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted uppercase">Payment</p>
                  {stop ? (
                    <p className="mt-1 inline-block rounded-lg border-2 border-danger px-3 py-2 text-base font-extrabold text-danger">
                      {stop}
                    </p>
                  ) : codDue ? (
                    <p className="mt-1 inline-block rounded-lg border-2 border-ink px-3 py-2 text-base font-extrabold">
                      COD: collect {formatPaise(o.total)}
                    </p>
                  ) : (
                    <p className="mt-1 font-bold">
                      {type === "receipt"
                        ? receiptPayment(o)
                        : o.paymentMethod === "cod"
                          ? "Cash on Delivery · collected"
                          : "Prepaid · do not collect cash"}
                    </p>
                  )}
                  {(o.courierName || o.awbCode) && (
                    <p className="mt-2 text-xs">
                      {o.courierName} {o.awbCode ? `· AWB ${o.awbCode}` : ""}
                    </p>
                  )}
                </div>
              </section>

              <table className="mt-5 w-full border-collapse">
                <thead>
                  <tr className="border-b border-ink text-left text-xs uppercase">
                    <th className="py-1.5">Item</th>
                    <th className="py-1.5">SKU</th>
                    <th className="py-1.5 text-right">Qty</th>
                    {type === "receipt" && <th className="py-1.5 text-right">Price</th>}
                    {type === "receipt" && <th className="py-1.5 text-right">Amount</th>}
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id} className="border-b border-line">
                      <td className="py-2">
                        {i.name} <span className="text-muted">({i.packCount} pcs)</span>
                      </td>
                      <td className="py-2 font-mono text-xs">{i.sku}</td>
                      <td className="py-2 text-right font-bold">{i.qty}</td>
                      {type === "receipt" && <td className="py-2 text-right">{formatPaise(i.unitPrice)}</td>}
                      {type === "receipt" && <td className="py-2 text-right">{formatPaise(i.lineTotal)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>

              {type === "receipt" && (
                <dl className="mt-3 ml-auto w-64 space-y-1">
                  <Line label="Subtotal" value={formatPaise(o.subtotal)} />
                  {o.discount > 0 && (
                    <Line
                      label={o.couponCode ? `Discount (${o.couponCode})` : "Discount"}
                      value={`−${formatPaise(o.discount)}`}
                    />
                  )}
                  <Line label="Delivery" value={o.shippingFee ? formatPaise(o.shippingFee) : "Free"} />
                  {o.codFee > 0 && <Line label="COD charge" value={formatPaise(o.codFee)} />}
                  <div className="flex justify-between border-t border-ink pt-1 text-base font-extrabold">
                    <dt>Total</dt>
                    <dd>{formatPaise(o.total)}</dd>
                  </div>
                  {o.refundedAmount > 0 && <Line label="Refunded" value={`−${formatPaise(o.refundedAmount)}`} />}
                  <p className="pt-1 text-right text-xs text-muted">Prices include GST.</p>
                </dl>
              )}

              <footer className="mt-8 border-t border-line pt-3 text-xs text-muted">
                Thank you for shopping with {siteConfig.name}!
                {support.length ? ` Questions or a damaged item? ${support.join(" · ")}` : ""}
                {type === "receipt" && " This is an order receipt, not a tax invoice."}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** The payment line on a customer receipt. */
function receiptPayment(o: { status: string; paymentStatus: string; paymentMethod: string; total: number }): string {
  if (o.paymentStatus === "refunded") return "Refunded";
  if (o.status === "pending_payment") return "Not paid";
  if (o.status === "cancelled") return o.paymentStatus === "paid" ? "Paid · order cancelled" : "Order cancelled";
  if (o.paymentMethod === "cod") {
    return o.paymentStatus === "paid" ? "Cash on Delivery · paid" : `Cash on Delivery · ${formatPaise(o.total)} to pay`;
  }
  return "Paid online";
}

/** Orders whose parcel must not leave the warehouse (shown on packing slips). */
function shipWarning(o: { status: string; paymentStatus: string; paymentMethod: string }): string | null {
  if (o.status === "cancelled") return "CANCELLED · do not ship";
  if (o.status === "rto") return "RETURNED (RTO) · do not ship";
  if (o.status === "pending_payment") return "NOT PAID · do not ship";
  if (o.paymentStatus === "refunded") return "REFUNDED · do not ship";
  return null;
}
