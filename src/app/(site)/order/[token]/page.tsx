import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle2, Clock, PackageCheck, Phone, Truck } from "lucide-react";
import { siteConfig, whatsappLink } from "@/config/site";
import { PendingPaymentActions } from "@/components/checkout/order-client";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { readCheckoutSettings } from "@/lib/catalog/service";
import { getDb } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import { getOrderByToken } from "@/lib/orders/service";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

export default function OrderPage({ params }: PageProps<"/order/[token]">) {
  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-surface" aria-busy="true" />}>
        <OrderDetails params={params} />
      </Suspense>
    </Container>
  );
}

async function OrderDetails({ params }: { params: PageProps<"/order/[token]">["params"] }) {
  // Always render per request: this page holds personal data and must never be cached.
  await connection();
  const { token } = await params;
  const order = await getOrderByToken(token);
  if (!order) notFound();

  const awaitingPayment = order.status === "pending_payment" && order.paymentStatus !== "paid";
  const cod = awaitingPayment ? await readCheckoutSettings(await getDb()) : null;
  const codTotal = cod ? order.subtotal - order.discount + order.shippingFee + cod.codFee : 0;
  const help = whatsappLink(`Hi, I need help with my order ${order.orderNumber}.`);

  return (
    <div className="space-y-6">
      {awaitingPayment ? (
        <div className="rounded-3xl border border-warn/30 bg-warn-soft p-6 sm:p-8">
          <Clock className="mb-3 size-8 text-warn" />
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Complete your payment</h1>
          <p className="mt-2 text-ink-soft">
            Order <strong>{order.orderNumber}</strong> is saved but not paid yet. Finish payment to confirm it.
          </p>
          <div className="mt-6 max-w-sm">
            <PendingPaymentActions
              orderToken={order.publicToken}
              totalLabel={formatPaise(order.total)}
              codLabel={cod && cod.codFee > 0 ? `+${formatPaise(cod.codFee)}` : "no extra charge"}
              codAvailable={cod !== null && codTotal <= cod.codMaxOrderValue}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-success-soft p-6 text-center sm:p-10">
          <CheckCircle2 className="mx-auto mb-3 size-12 text-success" />
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Thank you, {order.customerName.split(" ")[0]}!
          </h1>
          <p className="mt-2 text-ink-soft">
            Your order <strong>{order.orderNumber}</strong> is{" "}
            {order.status === "cancelled" ? "cancelled" : "confirmed"}.
          </p>
          {order.paymentMethod === "cod" && order.status !== "cancelled" && (
            <p className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold">
              Please keep {formatPaise(order.total)} ready for the delivery partner
            </p>
          )}
        </div>
      )}

      {!awaitingPayment && order.status !== "cancelled" && (
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: PackageCheck, title: "We pack it", text: `Dispatched within ${siteConfig.shipping.dispatch}.` },
            { icon: Truck, title: "On its way", text: `Delivered in ${siteConfig.shipping.delivery}.` },
            { icon: Phone, title: "Stay reachable", text: `The courier may call +91 ${order.phone}.` },
          ].map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border border-line p-4">
              <Icon className="mb-2 size-5 text-brand" />
              <p className="font-bold">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      )}

      <section className="rounded-3xl border border-line p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Order {order.orderNumber}</h2>
          <p className="text-sm text-muted">{formatDateTime(order.createdAt)}</p>
        </div>
        <ul className="divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-3">
              <span>
                {item.qty} × {item.name} <span className="text-muted">({item.packCount} sponges)</span>
              </span>
              <span className="font-semibold">{formatPaise(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          {order.discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
              <dd className="text-success">−{formatPaise(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd className="text-success">Free</dd>
          </div>
          {order.codFee > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">COD charge</dt>
              <dd>{formatPaise(order.codFee)}</dd>
            </div>
          )}
          <div className="flex justify-between pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatPaise(order.total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Payment</dt>
            <dd>
              {order.paymentMethod === "cod"
                ? "Cash on Delivery"
                : order.paymentStatus === "paid"
                  ? "Paid online"
                  : order.paymentStatus === "refunded"
                    ? "Refunded"
                    : "Online (pending)"}
            </dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-line pt-4 text-sm">
          <p className="mb-1 font-semibold">Delivering to</p>
          <p className="text-muted">
            {order.customerName}
            <br />
            {[order.address1, order.address2, order.landmark].filter(Boolean).join(", ")}
            <br />
            {order.city}, {order.state} {order.pincode}
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/track" className={buttonClasses("outline", "lg", "flex-1")}>
          Track order
        </Link>
        {help && (
          <a
            href={help}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("whatsapp", "lg", "flex-1")}
          >
            <WhatsAppIcon className="size-5" /> Help on WhatsApp
          </a>
        )}
      </div>
      <p className="text-center text-sm text-muted">
        Save your order number <strong>{order.orderNumber}</strong> to track it later.
      </p>
    </div>
  );
}
