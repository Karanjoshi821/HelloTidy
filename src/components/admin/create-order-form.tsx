"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createOrderAction } from "@/app/admin/order-actions";
import { buttonClasses } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { INDIAN_STATES } from "@/lib/india";
import { formatPaise } from "@/lib/money";
import { adminOrderLimits, quote, QuoteError, type PricingCatalog } from "@/lib/pricing";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { useResultToast } from "./toaster";
import { adminInput, adminSelect, adminTextarea } from "./ui";

export type StaffPack = PricingCatalog["packs"][number] & { hidden: boolean; stock: number | null };

type Line = { packId: string; qty: number };

function rupeesToPaise(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim())) return 0;
  return Math.round(Number(value) * 100);
}

/** "Create order": for phone / WhatsApp customers. The server re-prices everything. */
export function CreateOrderForm({
  packs,
  codFee,
  codMaxOrderValue,
  formKey,
  canDiscount,
}: {
  packs: StaffPack[];
  codFee: number;
  codMaxOrderValue: number;
  formKey: string;
  /** Owner only: manual discount and COD-fee waiver. */
  canDiscount: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction<ActionResult>(createOrderAction, null);
  // Success redirects to the new order (which toasts there); errors toast here.
  useResultToast(state);
  const firstPack = packs.find((p) => p.available && !p.hidden) ?? packs[0];
  const [lines, setLines] = useState<Line[]>(firstPack ? [{ packId: firstPack.id, qty: 1 }] : []);
  const [payment, setPayment] = useState<"cod" | "paid">("cod");
  const [discount, setDiscount] = useState("");
  const [waiveCodFee, setWaiveCodFee] = useState(false);
  const [city, setCity] = useState("");
  const [state_, setState] = useState("");
  const [pinStatus, setPinStatus] = useState<"idle" | "loading" | "notfound">("idle");

  const { totals, error } = useMemo(() => {
    if (!lines.length) return { totals: null, error: "Add at least one pack." };
    try {
      return {
        totals: quote({
          lines,
          paymentMethod: payment === "cod" ? "cod" : "prepaid",
          catalog: { packs, codFee, codMaxOrderValue },
          limits: adminOrderLimits,
          manualDiscount: rupeesToPaise(discount),
          waiveCodFee,
        }),
        error: null,
      };
    } catch (e) {
      return { totals: null, error: e instanceof QuoteError ? e.message : "Check the items." };
    }
  }, [lines, payment, discount, waiveCodFee, packs, codFee, codMaxOrderValue]);

  async function lookupPincode(pin: string) {
    setPinStatus("loading");
    try {
      const res = await fetch(`/api/pincode/${pin}`);
      const data = (await res.json()) as { ok: boolean; city?: string; state?: string | null };
      if (data.ok && data.city) {
        setCity(data.city);
        if (data.state) setState(data.state);
        setPinStatus("idle");
      } else setPinStatus("notfound");
    } catch {
      setPinStatus("idle");
    }
  }

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((current) => current.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const unusedPack = packs.find((p) => !lines.some((l) => l.packId === p.id));

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start" noValidate>
      <input type="hidden" name="key" value={formKey} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="expectedTotal" value={totals?.total ?? 0} />

      <div className="space-y-6">
        <section className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
          <h2 className="mb-3 font-bold">Items</h2>
          <ul className="space-y-3">
            {lines.map((line, i) => {
              const pack = packs.find((p) => p.id === line.packId);
              return (
                <li key={i} className="flex flex-wrap items-end gap-2">
                  <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm font-semibold">
                    Pack
                    <select
                      value={line.packId}
                      onChange={(e) => setLine(i, { packId: e.target.value })}
                      className={adminSelect}
                    >
                      {packs.map((p) => (
                        <option key={p.id} value={p.id} disabled={lines.some((l, j) => j !== i && l.packId === p.id)}>
                          {p.name} · {p.count} pcs · {formatPaise(p.price)}
                          {p.hidden ? " (hidden)" : ""}
                          {p.stock !== null ? ` · ${p.stock} in stock` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid w-24 gap-1 text-sm font-semibold">
                    Qty
                    <input
                      type="number"
                      min={1}
                      max={adminOrderLimits.maxQtyPerPack}
                      value={line.qty}
                      onChange={(e) => setLine(i, { qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                      className={adminInput}
                    />
                  </label>
                  <span className="w-24 pb-2.5 text-right text-sm font-semibold">
                    {pack ? formatPaise(pack.price * line.qty) : "-"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((_, j) => j !== i))}
                    className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface hover:text-danger"
                    aria-label={`Remove ${pack?.name ?? "line"}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {unusedPack && lines.length < adminOrderLimits.maxLines && (
            <button
              type="button"
              onClick={() => setLines((current) => [...current, { packId: unusedPack.id, qty: 1 }])}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
            >
              <Plus className="size-4" /> Add another pack
            </button>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
          <h2 className="mb-3 font-bold">Customer and delivery</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Full name" name="customerName" required maxLength={80} autoComplete="off" />
            <Input
              label="Mobile (10 digits)"
              name="phone"
              required
              inputMode="numeric"
              maxLength={14}
              autoComplete="off"
            />
            <Input label="Email (optional)" name="email" type="email" maxLength={120} autoComplete="off" />
            <label className="grid gap-1 text-sm font-semibold">
              Pincode
              <input
                name="pincode"
                required
                inputMode="numeric"
                maxLength={6}
                className={adminInput}
                onChange={(e) => {
                  const pin = e.target.value.replace(/\D/g, "").slice(0, 6);
                  e.target.value = pin;
                  if (/^[1-9]\d{5}$/.test(pin)) void lookupPincode(pin);
                }}
              />
              {pinStatus !== "idle" && (
                <span className="text-xs font-normal text-muted">
                  {pinStatus === "loading" ? "Finding the city…" : "Pincode not found, type the city and state."}
                </span>
              )}
            </label>
            <Input
              label="House / flat, building, street"
              name="address1"
              required
              maxLength={200}
              className="sm:col-span-2"
            />
            <Input label="Area / locality (optional)" name="address2" maxLength={200} />
            <Input label="Landmark (optional)" name="landmark" maxLength={100} />
            <label className="grid gap-1 text-sm font-semibold">
              City
              <input
                name="city"
                required
                maxLength={80}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={adminInput}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              State
              <select
                name="state"
                required
                value={state_}
                onChange={(e) => setState(e.target.value)}
                className={adminSelect}
              >
                <option value="">Select</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
          <h2 className="mb-3 font-bold">Notes</h2>
          <div className="grid gap-3">
            <Input
              label="Tags (optional, comma separated)"
              name="tags"
              placeholder="e.g. whatsapp, bulk"
              maxLength={200}
            />
            <label className="grid gap-1 text-sm font-semibold">
              Internal note (optional)
              <textarea name="note" rows={3} maxLength={1000} className={adminTextarea} />
            </label>
          </div>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6">
        <section className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
          <h2 className="mb-3 font-bold">Payment</h2>
          <fieldset className="grid gap-2">
            <legend className="sr-only">How the customer pays</legend>
            {(
              [
                ["cod", "Cash on Delivery", "Collected by the courier"],
                ["paid", "Already paid", "UPI, bank transfer or cash"],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3",
                  payment === value ? "border-brand bg-brand-soft/50" : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="payment"
                  value={value}
                  checked={payment === value}
                  onChange={() => setPayment(value)}
                  className="mt-1 accent-brand"
                />
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {payment === "paid" && (
            <div className="mt-3">
              <Input label="UPI / bank reference" name="paymentReference" required maxLength={100} />
            </div>
          )}
          {canDiscount && payment === "cod" && codFee > 0 && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="waiveCodFee"
                checked={waiveCodFee}
                onChange={(e) => setWaiveCodFee(e.target.checked)}
                className="size-4 accent-brand"
              />
              Don&apos;t charge the {formatPaise(codFee)} COD fee
            </label>
          )}
          {canDiscount && (
            <label className="mt-3 grid gap-1 text-sm font-semibold">
              Discount in ₹ (optional)
              <input
                name="manualDiscount"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                className={adminInput}
              />
            </label>
          )}

          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            {totals ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted">Subtotal ({totals.itemCount} items)</dt>
                  <dd>{formatPaise(totals.subtotal)}</dd>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">Discount</dt>
                    <dd>−{formatPaise(totals.discount)}</dd>
                  </div>
                )}
                {totals.codFee > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">COD charge</dt>
                    <dd>{formatPaise(totals.codFee)}</dd>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-base font-bold">
                  <dt>{payment === "cod" ? "To collect" : "Total paid"}</dt>
                  <dd>{formatPaise(totals.total)}</dd>
                </div>
                {payment === "cod" && !totals.codAvailable && (
                  <p className="pt-1 text-xs text-warn">
                    Above the website&apos;s COD limit ({formatPaise(codMaxOrderValue)}). Allowed here because
                    you&apos;ve spoken to the customer.
                  </p>
                )}
              </>
            ) : (
              <p className="text-danger">{error}</p>
            )}
          </dl>
        </section>

        {state && !state.ok && (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {state.message}
          </p>
        )}
        <button type="submit" disabled={pending || !totals} className={buttonClasses("primary", "lg", "w-full")}>
          {pending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            `Create order${totals ? ` · ${formatPaise(totals.total)}` : ""}`
          )}
        </button>
        <p className="text-xs text-muted">
          Stock is taken now. The customer gets a confirmation email if you add their email.
        </p>
      </aside>
    </form>
  );
}

function Input({ label, className, ...props }: { label: string; name: string } & ComponentProps<"input">) {
  return (
    <label className={cn("grid gap-1 text-sm font-semibold", className)}>
      {label}
      <input className={adminInput} {...props} />
    </label>
  );
}
