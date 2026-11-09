"use client";

import { Check, ExternalLink, Loader2 } from "lucide-react";
import { trackOrderAction, type TrackState } from "@/app/(site)/track/actions";
import { formatPaise } from "@/lib/money";
import { useFormAction } from "@/lib/use-form-action";
import { cn, formatDateTime } from "@/lib/utils";
import { buttonClasses } from "./ui/button";
import { Field, TextInput } from "./ui/field";

const steps = [
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const;

const progress: Record<string, number> = {
  pending_payment: -1,
  confirmed: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
};

export function TrackForm() {
  const { state, onSubmit, pending } = useFormAction<TrackState>(trackOrderAction, { status: "idle" });
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-line p-6" noValidate>
        <Field
          label="Order number"
          name="orderNumber"
          error={errors.orderNumber}
          hint="Shown on your confirmation page, e.g. HT-7K3P9Q"
        >
          <TextInput
            name="orderNumber"
            placeholder="HT-XXXXXX"
            autoCapitalize="characters"
            error={errors.orderNumber}
            required
          />
        </Field>
        <Field label="Mobile number used for the order" name="phone" error={errors.phone}>
          <TextInput
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            error={errors.phone}
            required
          />
        </Field>
        <button type="submit" disabled={pending} className={buttonClasses("primary", "lg", "w-full")}>
          {pending ? <Loader2 className="size-5 animate-spin" /> : "Track order"}
        </button>
        {state.status === "error" && !Object.keys(errors).length && (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
            {state.message}
          </p>
        )}
      </form>

      {state.status === "found" && <TrackResult order={state.order} />}
    </div>
  );
}

function TrackResult({ order }: { order: Extract<TrackState, { status: "found" }>["order"] }) {
  const step = progress[order.status] ?? -1;
  const ended = order.status === "cancelled" || order.status === "rto";

  return (
    <section className="rounded-3xl border border-line p-6" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Order {order.orderNumber}</h2>
        <p className="text-sm text-muted">Placed {formatDateTime(order.createdAt)}</p>
      </div>

      {ended ? (
        <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 font-semibold text-danger">
          {order.status === "cancelled" ? "This order was cancelled." : "This order was returned to us by the courier."}
        </p>
      ) : order.status === "pending_payment" ? (
        <p className="mt-4 rounded-xl bg-warn-soft px-4 py-3 font-semibold text-warn">Waiting for payment.</p>
      ) : (
        <ol className="mt-6 grid grid-cols-4 gap-2">
          {steps.map((s, i) => (
            <li key={s.key} className="text-center">
              <span
                className={cn(
                  "mx-auto mb-2 grid size-9 place-items-center rounded-full border-2 text-sm font-bold",
                  i <= step ? "border-success bg-success text-white" : "border-line text-muted",
                )}
              >
                {i <= step ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("text-xs font-semibold sm:text-sm", i <= step ? "text-ink" : "text-muted")}>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      )}

      {(order.courierName || order.awbCode) && (
        <div className="mt-6 rounded-2xl bg-surface p-4 text-sm">
          <p>
            <span className="text-muted">Courier:</span> <strong>{order.courierName ?? "-"}</strong>
          </p>
          {order.awbCode && (
            <p>
              <span className="text-muted">Tracking number:</span> <strong>{order.awbCode}</strong>
            </p>
          )}
          {order.trackingUrl && (
            <a
              href={order.trackingUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-2 inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              Track with courier <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      )}

      <ul className="mt-6 divide-y divide-line border-t border-line text-sm">
        {order.items.map((item) => (
          <li key={item.name} className="py-2">
            {item.qty} × {item.name} ({item.packCount} sponges)
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">
        <span className="text-muted">Total:</span> <strong>{formatPaise(order.total)}</strong> ·{" "}
        {order.paymentMethod === "cod"
          ? "Cash on Delivery"
          : order.paymentStatus === "paid"
            ? "Paid online"
            : "Online payment"}
      </p>
    </section>
  );
}
