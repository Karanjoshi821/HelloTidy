import type { Metadata } from "next";
import { Suspense, type ComponentProps } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, CheckCircle2, Phone, Printer, Receipt, TriangleAlert, UserRound } from "lucide-react";
import {
  addCommentAction,
  convertToCodAction,
  recordRefundAction,
  setOrderTagsAction,
  updateContactAction,
  updateNotesAction,
  sendToShiprocketAction,
  updateShippingAction,
  updateStatusAction,
  verifyCodAction,
} from "@/app/admin/order-actions";
import { ActionForm } from "@/components/admin/action-form";
import { FlashToast } from "@/components/admin/toaster";
import { OrderVisitCard } from "@/components/admin/order-visit-card";
import { RecoveryButton } from "@/components/admin/recovery-button";
import { PaymentBadge, StatusBadge, TagList } from "@/components/admin/status";
import { adminInput, adminSelect, adminTextarea, Card, Notice, PageHeader } from "@/components/admin/ui";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { buttonClasses } from "@/components/ui/button";
import { absoluteUrl } from "@/config/site";
import { requireAdmin } from "@/lib/auth/dal";
import { readCheckoutSettings } from "@/lib/catalog/service";
import { getDb } from "@/lib/db";
import { shiprocketConfig } from "@/lib/env";
import { INDIAN_STATES } from "@/lib/india";
import { formatPaise } from "@/lib/money";
import { CANCEL_REASONS, getOrderDetail, STATUS_LABELS, STATUS_TRANSITIONS } from "@/lib/orders/admin";
import { cn, formatDateTime } from "@/lib/utils";
import { codVerificationText, generalText, paymentReminderText, shippedText, waLink } from "@/lib/whatsapp-templates";

export const metadata: Metadata = { title: "Order" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

const EVENT_DOT: Record<string, string> = {
  comment: "bg-ink",
  paid: "bg-success",
  refunded: "bg-warn",
  payment_failed: "bg-danger",
  payment_mismatch: "bg-danger",
  duplicate_payment: "bg-danger",
  cod_verified: "bg-success",
};

export default async function OrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  const user = await requireAdmin();
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();
  const { order, items, events, refunds, customer, laterOrder } = detail;
  const isOwner = user.role === "owner";
  const settings = order.status === "pending_payment" ? await readCheckoutSettings(await getDb()) : null;

  const next = STATUS_TRANSITIONS[order.status];
  const forward = next.filter((s) => s !== "cancelled" && s !== "rto");
  const canCancel = next.includes("cancelled");
  const canRto = next.includes("rto");
  const open = order.status === "confirmed" || order.status === "processing";
  const shiprocketReady = Boolean(shiprocketConfig()?.pickupLocation);
  const editable = order.status === "pending_payment" || open;
  const codOpen = order.paymentMethod === "cod" && open;
  const remaining = order.total - order.refundedAmount;
  const address = [order.address1, order.address2, order.landmark].filter(Boolean).join(", ");
  const recoveries = events.filter((e) => e.type === "recovery_sent").length;
  // The cookie choice and Google ids are shown in "How they found us", not as raw values.
  const attribution = Object.entries(order.attribution ?? {}).filter(
    ([k, v]) => v && !["consent", "gaClientId", "gaSessionId"].includes(k),
  );
  const cookieChoice = order.attribution?.consent;

  return (
    <div className="space-y-6">
      <FlashToast param="created" message="Order created. Stock has been updated." />
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        title={<span className="font-mono">{order.orderNumber}</span>}
        badges={
          <>
            <StatusBadge status={order.status} />
            <PaymentBadge
              method={order.paymentMethod}
              status={order.paymentStatus}
              refundedAmount={order.refundedAmount}
            />
            {order.source === "admin" && (
              <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold text-ink-soft">
                Created by staff
              </span>
            )}
          </>
        }
        description={`Placed ${formatDateTime(order.createdAt)}`}
        actions={
          <>
            <a
              href={`/admin/print/orders?ids=${order.id}&type=slip`}
              target="_blank"
              rel="noopener"
              className={buttonClasses("outline", "sm")}
            >
              <Printer className="size-4" /> Packing slip
            </a>
            <a
              href={`/admin/print/orders?ids=${order.id}&type=receipt`}
              target="_blank"
              rel="noopener"
              className={buttonClasses("outline", "sm")}
            >
              <Receipt className="size-4" /> Receipt
            </a>
          </>
        }
      />

      {/* Phones: one column ordered by what staff act on first. Desktop: two columns. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="contents lg:block lg:space-y-6">
          <Card title={`Items (${items.reduce((s, i) => s + i.qty, 0)})`} className="order-1">
            <ul className="divide-y divide-line text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 py-2 first:pt-0">
                  <span>
                    <span className="font-semibold">
                      {item.qty} × {item.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {item.packCount} pcs · {item.sku} · {formatPaise(item.unitPrice)} each
                    </span>
                  </span>
                  <span className="font-semibold">{formatPaise(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <Row label="Subtotal" value={formatPaise(order.subtotal)} />
              {order.discount > 0 && (
                <Row
                  label={order.couponCode ? `Discount (${order.couponCode})` : "Discount"}
                  value={`−${formatPaise(order.discount)}`}
                />
              )}
              <Row label="Delivery" value={order.shippingFee ? formatPaise(order.shippingFee) : "Free"} />
              {order.codFee > 0 && <Row label="COD charge" value={formatPaise(order.codFee)} />}
              <div className="flex justify-between pt-1 text-base font-bold">
                <dt>
                  {order.paymentMethod === "cod" && order.paymentStatus !== "paid" ? "To collect on delivery" : "Total"}
                </dt>
                <dd>{formatPaise(order.total)}</dd>
              </div>
              {order.refundedAmount > 0 && (
                <>
                  <Row label="Refunded" value={`−${formatPaise(order.refundedAmount)}`} />
                  <Row label="Net" value={formatPaise(remaining)} strong />
                </>
              )}
            </dl>
          </Card>

          <Card
            className="order-5"
            title="Shipping"
            description={
              order.status === "shipped" || order.status === "delivered"
                ? `Shipped ${order.shippedAt ? formatDateTime(order.shippedAt) : ""}`
                : "Customers see these on the Track Order page and in the shipping email."
            }
          >
            <ActionForm action={updateShippingAction} className="space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="from" value={order.status} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">
                  Courier
                  <input
                    name="courierName"
                    defaultValue={order.courierName ?? ""}
                    placeholder="e.g. Delhivery"
                    maxLength={60}
                    className={adminInput}
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  AWB / tracking number
                  <input name="awbCode" defaultValue={order.awbCode ?? ""} maxLength={60} className={adminInput} />
                </label>
              </div>
              <label className="grid gap-1 text-sm font-semibold">
                Tracking link
                <input
                  name="trackingUrl"
                  type="url"
                  defaultValue={order.trackingUrl ?? ""}
                  placeholder="https://…"
                  maxLength={300}
                  className={adminInput}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" name="intent" value="save" className={buttonClasses("secondary", "sm")}>
                  Save
                </button>
                {open && (
                  <button type="submit" name="intent" value="ship" className={buttonClasses("primary", "sm")}>
                    Save &amp; mark as shipped
                  </button>
                )}
                {order.status === "shipped" && (
                  <a
                    href={waLink(order.phone, shippedText(order, absoluteUrl("/track")))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses("whatsapp", "sm")}
                  >
                    <WhatsAppIcon className="size-4" /> Send tracking
                  </a>
                )}
              </div>
            </ActionForm>

            {shiprocketReady && order.status !== "pending_payment" && (
              <div className="mt-5 border-t border-line pt-4 text-sm">
                <p className="font-semibold">Shiprocket</p>
                <p className="mt-0.5 text-muted">
                  {order.shiprocketOrderId
                    ? `Order #${order.shiprocketOrderId}${order.shiprocketSyncedAt ? `, last sent ${formatDateTime(order.shiprocketSyncedAt)}` : ""}`
                    : "Not sent yet."}
                </p>
                {order.shiprocketError && (
                  <p className="mt-1 text-danger">Last attempt failed: {order.shiprocketError}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {order.status !== "cancelled" && (
                    <ActionForm action={sendToShiprocketAction}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <button type="submit" className={buttonClasses("secondary", "sm")}>
                        {order.shiprocketOrderId ? "Update in Shiprocket" : "Send to Shiprocket"}
                      </button>
                    </ActionForm>
                  )}
                  {order.shiprocketOrderId && (
                    <a
                      href={`/admin/orders/${order.id}/shiprocket-invoice`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses("outline", "sm")}
                    >
                      Shiprocket invoice
                    </a>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card title="Timeline" className="order-6">
            <ActionForm action={addCommentAction} resetOnSuccess className="mb-5 flex gap-2">
              <input type="hidden" name="orderId" value={order.id} />
              <label className="sr-only" htmlFor="comment">
                Add a comment
              </label>
              <input
                id="comment"
                name="message"
                placeholder="Add a comment for the team…"
                maxLength={1000}
                required
                className={cn(adminInput, "flex-1")}
              />
              <button type="submit" className={buttonClasses("secondary", "sm", "h-11 sm:h-10")}>
                Post
              </button>
            </ActionForm>
            <ol className="space-y-3 text-sm">
              {[...events].reverse().map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", EVENT_DOT[e.type] ?? "bg-brand")} />
                  <div className="min-w-0">
                    <p className={cn("break-words", e.type === "comment" && "rounded-lg bg-surface px-3 py-2")}>
                      {e.message}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(e.createdAt)} · {e.actor}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="contents lg:block lg:space-y-6">
          {order.status === "pending_payment" && settings && (
            <Card title="Payment not completed" className="order-2">
              <p className="mb-3 text-sm text-muted">
                The customer started paying online but didn&apos;t finish. Send a reminder with their order link (they
                can pay or switch to COD there), or confirm it as COD if they agree on a call
                {settings.codFee > 0 ? ` (the ${formatPaise(settings.codFee)} COD charge is added)` : ""}. Razorpay is
                checked first, so nobody is charged twice.
              </p>
              {laterOrder && (
                <div className="mb-3">
                  <Notice tone="warn">
                    This customer placed{" "}
                    <Link href={`/admin/orders/${laterOrder.id}`} className="font-semibold underline">
                      {laterOrder.orderNumber}
                    </Link>{" "}
                    afterwards, so there&apos;s no need to chase this one. Cancel it with the reason “Payment not
                    completed”.
                  </Notice>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {!laterOrder && (
                  <RecoveryButton
                    orderId={order.id}
                    href={waLink(order.phone, paymentReminderText(order, absoluteUrl(`/order/${order.publicToken}`)))}
                    sent={recoveries}
                  />
                )}
                <ActionForm action={convertToCodAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <button type="submit" className={buttonClasses("outline", "sm")}>
                    Confirm as Cash on Delivery
                  </button>
                </ActionForm>
              </div>
            </Card>
          )}

          {codOpen && (
            <Card title="COD verification" className="order-2">
              {order.codVerifiedAt ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="size-5" /> Verified {formatDateTime(order.codVerifiedAt)}
                </p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-muted">
                    Confirm the order with the customer before shipping. Verified COD orders are refused far less often.
                  </p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <a href={`tel:+91${order.phone}`} className={buttonClasses("outline", "sm")}>
                      <Phone className="size-4" /> Call
                    </a>
                    <a
                      href={waLink(order.phone, codVerificationText(order))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses("whatsapp", "sm")}
                    >
                      <WhatsAppIcon className="size-4" /> Ask to confirm
                    </a>
                  </div>
                  <ActionForm action={verifyCodAction} className="flex gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input
                      name="note"
                      placeholder="Note (optional)"
                      maxLength={200}
                      className={cn(adminInput, "flex-1")}
                      aria-label="Verification note"
                    />
                    <button type="submit" className={buttonClasses("primary", "sm", "h-11 sm:h-10")}>
                      Verified
                    </button>
                  </ActionForm>
                </>
              )}
            </Card>
          )}

          <Card title="Status" className="order-3">
            {next.length === 0 ? (
              <p className="text-sm text-muted">
                This order is closed ({STATUS_LABELS[order.status]}).
                {order.cancelReason ? ` Reason: ${order.cancelReason}.` : ""}
              </p>
            ) : (
              <div className="space-y-4">
                {forward.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {forward.map((s) => (
                      <ActionForm key={s} action={updateStatusAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="from" value={order.status} />
                        <input type="hidden" name="status" value={s} />
                        <button
                          type="submit"
                          className={buttonClasses(s === "confirmed" ? "outline" : "primary", "sm")}
                        >
                          {s === "confirmed" ? "Move back to Confirmed" : `Mark as ${STATUS_LABELS[s]}`}
                        </button>
                      </ActionForm>
                    ))}
                  </div>
                )}
                {canRto && (
                  <details className="rounded-xl border border-line">
                    <summary className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
                      <TriangleAlert className="size-4 text-danger" /> Returned to us (RTO)
                    </summary>
                    <ActionForm
                      action={updateStatusAction}
                      className="space-y-3 border-t border-line p-3"
                      confirm={`Mark ${order.orderNumber} as returned (RTO)?`}
                    >
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="from" value={order.status} />
                      <input type="hidden" name="status" value="rto" />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="restock" defaultChecked className="size-4 accent-brand" />
                        Put the items back in stock
                      </label>
                      <button type="submit" className={buttonClasses("outline", "sm")}>
                        Mark as returned
                      </button>
                    </ActionForm>
                  </details>
                )}
                {canCancel && (
                  <details className="rounded-xl border border-line">
                    <summary className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
                      <Ban className="size-4 text-danger" /> Cancel order
                    </summary>
                    <ActionForm
                      action={updateStatusAction}
                      className="space-y-3 border-t border-line p-3"
                      confirm={`Cancel ${order.orderNumber}? This can't be undone.`}
                    >
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="from" value={order.status} />
                      <input type="hidden" name="status" value="cancelled" />
                      <label className="grid gap-1 text-sm font-semibold">
                        Reason
                        <select name="reason" required defaultValue="" className={adminSelect}>
                          <option value="" disabled>
                            Choose a reason…
                          </option>
                          {CANCEL_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>
                      {order.status !== "pending_payment" && (
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="restock" defaultChecked className="size-4 accent-brand" />
                          Put the items back in stock
                        </label>
                      )}
                      {order.paymentStatus === "paid" && (
                        <p className="text-xs text-warn">
                          This order is paid. Refund it in Razorpay (or by UPI), then record the refund below.
                        </p>
                      )}
                      <button type="submit" className={buttonClasses("outline", "sm", "border-danger/40 text-danger")}>
                        Cancel order
                      </button>
                    </ActionForm>
                  </details>
                )}
              </div>
            )}
          </Card>

          <Card
            className="order-4"
            title="Customer"
            actions={
              customer && (
                <Link
                  href={`/admin/customers/${customer.id}`}
                  className="text-sm font-semibold text-brand hover:underline"
                >
                  Profile
                </Link>
              )
            }
          >
            <p className="flex items-center gap-2 font-semibold">
              <UserRound className="size-4 text-muted" /> {order.customerName}
            </p>
            {customer && (
              <p className="mt-1 text-sm text-muted">
                {customer.orders} order{customer.orders === 1 ? "" : "s"}
                {customer.rto > 0 && (
                  <span className="font-semibold text-danger"> · {customer.rto} returned (RTO)</span>
                )}
                {customer.codBlocked && <span className="font-semibold text-danger"> · COD blocked</span>}
              </p>
            )}
            {customer && customer.tags.length > 0 && (
              <div className="mt-2">
                <TagList tags={customer.tags} />
              </div>
            )}
            <p className="mt-3 text-sm">
              <a href={`tel:+91${order.phone}`} className="font-medium hover:underline">
                +91 {order.phone}
              </a>
              {order.email && (
                <>
                  <br />
                  <a href={`mailto:${order.email}`} className="text-muted hover:underline">
                    {order.email}
                  </a>
                </>
              )}
            </p>
            <p className="mt-3 text-sm text-muted">
              {address}
              <br />
              {order.city}, {order.state} - {order.pincode}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`tel:+91${order.phone}`} className={buttonClasses("outline", "sm")}>
                <Phone className="size-4" /> Call
              </a>
              <a
                href={waLink(order.phone, generalText(order))}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("whatsapp", "sm")}
              >
                <WhatsAppIcon className="size-4" /> WhatsApp
              </a>
            </div>
            {editable && (
              <details className="mt-4 rounded-xl border border-line">
                <summary className="px-3 py-2 text-sm font-semibold">Edit details or address</summary>
                <ActionForm action={updateContactAction} className="grid gap-3 border-t border-line p-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <FieldInput
                    label="Name"
                    name="customerName"
                    defaultValue={order.customerName}
                    required
                    maxLength={80}
                  />
                  <FieldInput
                    label="Mobile"
                    name="phone"
                    defaultValue={order.phone}
                    required
                    inputMode="numeric"
                    maxLength={14}
                  />
                  <FieldInput
                    label="Email"
                    name="email"
                    type="email"
                    defaultValue={order.email ?? ""}
                    maxLength={120}
                  />
                  <FieldInput
                    label="House / flat, street"
                    name="address1"
                    defaultValue={order.address1}
                    required
                    maxLength={200}
                  />
                  <FieldInput label="Area" name="address2" defaultValue={order.address2 ?? ""} maxLength={200} />
                  <FieldInput label="Landmark" name="landmark" defaultValue={order.landmark ?? ""} maxLength={100} />
                  <div className="grid grid-cols-2 gap-2">
                    <FieldInput label="City" name="city" defaultValue={order.city} required maxLength={80} />
                    <FieldInput
                      label="Pincode"
                      name="pincode"
                      defaultValue={order.pincode}
                      required
                      inputMode="numeric"
                      maxLength={6}
                    />
                  </div>
                  <label className="grid gap-1 text-sm font-semibold">
                    State
                    <select name="state" defaultValue={order.state} className={adminSelect}>
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className={buttonClasses("secondary", "sm")}>
                    Save details
                  </button>
                </ActionForm>
              </details>
            )}
          </Card>

          <Card title="Tags" className="order-7">
            <ActionForm action={setOrderTagsAction} className="flex gap-2">
              <input type="hidden" name="orderId" value={order.id} />
              <input
                name="tags"
                key={order.tags.join(",")}
                defaultValue={order.tags.join(", ")}
                placeholder="e.g. vip, gift, repeat"
                className={cn(adminInput, "flex-1")}
                aria-label="Tags, separated by commas"
              />
              <button type="submit" className={buttonClasses("secondary", "sm", "h-11 sm:h-10")}>
                Save
              </button>
            </ActionForm>
            <p className="mt-2 text-xs text-muted">Separate with commas. Filter orders by tag on the Orders page.</p>
          </Card>

          <Card title="Internal notes" description="Only staff see these." className="order-8">
            <ActionForm action={updateNotesAction} className="space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <textarea
                name="notes"
                defaultValue={order.adminNotes ?? ""}
                rows={4}
                maxLength={2000}
                className={adminTextarea}
                aria-label="Internal notes"
              />
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Save notes
              </button>
            </ActionForm>
          </Card>

          {isOwner && (order.paymentStatus === "paid" || refunds.length > 0) && (
            <Card title="Refunds" className="order-9">
              {refunds.length > 0 && (
                <ul className="mb-4 space-y-2 text-sm">
                  {refunds.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3">
                      <span>
                        {r.reason}
                        <span className="block text-xs text-muted">
                          {formatDateTime(r.createdAt)} · {r.actor}
                          {r.reference ? ` · ${r.reference}` : ""}
                        </span>
                      </span>
                      <span className="font-semibold">−{formatPaise(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {order.paymentStatus === "paid" && remaining > 0 && (
                <ActionForm
                  action={recordRefundAction}
                  className="grid gap-3"
                  confirm="Record this refund? Make sure you've sent the money first."
                >
                  <input type="hidden" name="orderId" value={order.id} />
                  <p className="text-sm text-muted">
                    Send the money first (
                    {order.paymentMethod === "prepaid" && order.razorpayPaymentId
                      ? "Razorpay dashboard → Payments → Refund"
                      : "UPI or bank transfer"}
                    ), then record it here.
                  </p>
                  <FieldInput
                    label={`Amount (₹, up to ${formatPaise(remaining)})`}
                    name="amount"
                    inputMode="decimal"
                    defaultValue={String(remaining / 100)}
                    required
                  />
                  <FieldInput
                    label="Reason"
                    name="reason"
                    required
                    maxLength={200}
                    placeholder="e.g. damaged in transit"
                  />
                  <FieldInput
                    label="Refund reference (optional)"
                    name="reference"
                    maxLength={100}
                    placeholder="rfnd_… or UPI ref"
                  />
                  <button type="submit" className={buttonClasses("outline", "sm")}>
                    Record refund
                  </button>
                </ActionForm>
              )}
            </Card>
          )}

          <Suspense fallback={null}>
            <OrderVisitCard order={order} className="order-10" />
          </Suspense>

          <Card title="Details" className="order-10">
            <dl className="space-y-1.5 text-xs">
              <Detail label="Source" value={order.source === "admin" ? "Created by staff" : "Website checkout"} />
              {order.confirmedAt && <Detail label="Confirmed" value={formatDateTime(order.confirmedAt)} />}
              {order.paidAt && <Detail label="Paid" value={formatDateTime(order.paidAt)} />}
              {order.deliveredAt && <Detail label="Delivered" value={formatDateTime(order.deliveredAt)} />}
              {order.cancelledAt && <Detail label="Cancelled" value={formatDateTime(order.cancelledAt)} />}
              {order.paymentReference && <Detail label="Payment ref" value={order.paymentReference} mono />}
              {order.razorpayOrderId && <Detail label="Razorpay order" value={order.razorpayOrderId} mono />}
              {order.razorpayPaymentId && <Detail label="Razorpay payment" value={order.razorpayPaymentId} mono />}
              {attribution.map(([k, v]) => (
                <Detail key={k} label={k} value={String(v)} />
              ))}
              {cookieChoice && <Detail label="Cookies" value={cookieChoice === "granted" ? "Accepted" : "Declined"} />}
              {isOwner && order.clientIp && <Detail label="IP" value={order.clientIp} mono />}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "font-bold")}>
      <dt className={strong ? "" : "text-muted"}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("text-right break-all", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function FieldInput({ label, ...props }: { label: string; name: string } & ComponentProps<"input">) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      {label}
      <input className={adminInput} {...props} />
    </label>
  );
}
