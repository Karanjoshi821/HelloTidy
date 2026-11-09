"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import { adminInput } from "./ui";

export type DiscountFormValues = {
  id?: string;
  code: string;
  description: string;
  type: "percent" | "flat";
  /** Whole percent, or rupees as typed. */
  percent: string;
  amount: string;
  minOrder: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  oncePerCustomer: boolean;
  active: boolean;
};

export function DiscountForm({
  action,
  values,
  submitLabel,
  locked,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  values: DiscountFormValues;
  submitLabel: string;
  /** The code is on orders: it can't be renamed. */
  locked?: boolean;
}) {
  const { state, onSubmit, pending } = useFormAction<ActionResult>(action, null);
  const [type, setType] = useState(values.type);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <section className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
        <h2 className="mb-3 font-bold">Code</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">
            Discount code
            <input
              name="code"
              defaultValue={values.code}
              required
              maxLength={30}
              readOnly={locked}
              className={cn(adminInput, "font-mono uppercase", locked && "bg-surface")}
            />
            <span className="text-xs font-normal text-muted">
              {locked ? "Used on orders, so it can't be renamed." : "Customers type this at checkout (any case)."}
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Shown to the customer
            <input
              name="description"
              defaultValue={values.description}
              required
              maxLength={120}
              placeholder="e.g. Diwali offer: 10% off"
              className={adminInput}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
        <h2 className="mb-3 font-bold">Value</h2>
        <fieldset className="mb-3 flex flex-wrap gap-4 text-sm">
          <legend className="sr-only">Discount type</legend>
          {(
            [
              ["percent", "Percentage"],
              ["flat", "Fixed amount (₹)"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 font-semibold">
              <input
                type="radio"
                name="type"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="accent-brand"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          {type === "percent" ? (
            <>
              <label className="grid gap-1 text-sm font-semibold">
                Percent off
                <input
                  name="percent"
                  type="number"
                  min={1}
                  max={90}
                  defaultValue={values.percent}
                  required
                  className={adminInput}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Maximum discount (₹, optional)
                <input
                  name="maxDiscount"
                  inputMode="decimal"
                  defaultValue={values.maxDiscount}
                  className={adminInput}
                />
              </label>
              <input type="hidden" name="amount" value="" />
            </>
          ) : (
            <>
              <label className="grid gap-1 text-sm font-semibold">
                Amount off (₹)
                <input name="amount" inputMode="decimal" defaultValue={values.amount} required className={adminInput} />
              </label>
              <input type="hidden" name="percent" value="" />
              <input type="hidden" name="maxDiscount" value="" />
            </>
          )}
          <label className="grid gap-1 text-sm font-semibold">
            Minimum order (₹, optional)
            <input name="minOrder" inputMode="decimal" defaultValue={values.minOrder} className={adminInput} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
        <h2 className="mb-3 font-bold">Limits and dates</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">
            Starts (optional, India time)
            <input name="startsAt" type="datetime-local" defaultValue={values.startsAt} className={adminInput} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Ends (optional, India time)
            <input name="endsAt" type="datetime-local" defaultValue={values.endsAt} className={adminInput} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Total uses (optional)
            <input
              name="usageLimit"
              type="number"
              min={1}
              max={1000000}
              defaultValue={values.usageLimit}
              className={adminInput}
            />
            <span className="text-xs font-normal text-muted">Unpaid and cancelled orders don&apos;t use it up.</span>
          </label>
          <div className="grid content-start gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                name="oncePerCustomer"
                defaultChecked={values.oncePerCustomer}
                className="size-4 accent-brand"
              />
              One use per mobile number
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="active" defaultChecked={values.active} className="size-4 accent-brand" />
              Active
            </label>
          </div>
        </div>
      </section>

      {state && (
        <p className={cn("text-sm", state.ok ? "text-success" : "text-danger")} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClasses("primary")}>
        {pending && <Loader2 className="size-4 animate-spin" />} {submitLabel}
      </button>
    </form>
  );
}
