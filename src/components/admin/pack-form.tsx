import type { ReactNode } from "react";
import type { PackRow } from "@/lib/db/schema";
import { buttonClasses } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { ActionForm } from "./action-form";
import { adminInput } from "./ui";

function rupees(paise: number | undefined): string {
  return paise === undefined ? "" : String(paise / 100);
}

/** Add / edit a pack (owner only). Server-rendered fields inside a client ActionForm. */
export function PackForm({
  action,
  pack,
  submitLabel,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  pack?: PackRow;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="space-y-6">
      {pack && <input type="hidden" name="id" value={pack.id} />}

      <Section title="Details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" hint="e.g. Home Pack">
            <input name="name" defaultValue={pack?.name} required maxLength={40} className={adminInput} />
          </Field>
          <Field label="Pieces per pack">
            <input
              name="count"
              type="number"
              min={1}
              max={10000}
              defaultValue={pack?.count}
              required
              className={adminInput}
            />
          </Field>
          <Field label="Short description" hint="Shown under the pack name (max 80 characters)" wide>
            <input name="blurb" defaultValue={pack?.blurb} maxLength={80} className={adminInput} />
          </Field>
          <Field label="Badge (optional)" hint="“Most popular” shows in yellow, anything else in blue">
            <input name="badge" defaultValue={pack?.badge ?? ""} maxLength={24} className={adminInput} />
          </Field>
          <Field label="SKU" hint="Your stock code; also used for Shiprocket">
            <input name="sku" defaultValue={pack?.sku} required maxLength={40} className={`${adminInput} uppercase`} />
          </Field>
        </div>
      </Section>

      <Section title="Pricing" hint="Prices include GST. Shipping is free on every order.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price (₹)">
            <input
              name="price"
              inputMode="decimal"
              defaultValue={rupees(pack?.price)}
              required
              className={adminInput}
            />
          </Field>
          <Field label="MRP (₹)" hint="Must match the MRP printed on the pack (Legal Metrology).">
            <input name="mrp" inputMode="decimal" defaultValue={rupees(pack?.mrp)} required className={adminInput} />
          </Field>
        </div>
      </Section>

      <Section title="Inventory">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="trackInventory"
              defaultChecked={pack?.trackInventory ?? false}
              className="mt-0.5 size-4 accent-brand"
            />
            <span>
              <span className="font-semibold">Track stock</span>
              <span className="block text-muted">
                Orders take stock; the pack shows “Out of stock” at zero. Off means it never runs out.
              </span>
            </span>
          </label>
          {pack ? (
            <Field
              label="Available"
              hint="Changing this records a count correction. Use “Adjust stock” for deliveries."
            >
              <input type="hidden" name="stockExpected" value={pack.stock} />
              <input
                name="stock"
                type="number"
                min={-1000000}
                max={1000000}
                defaultValue={pack.stock}
                required
                className={adminInput}
              />
            </Field>
          ) : (
            <Field label="Opening stock">
              <input name="stock" type="number" min={0} max={1000000} defaultValue={0} className={adminInput} />
            </Field>
          )}
          <Field label="Low-stock alert at" hint="You get an alert when stock falls to this level.">
            <input
              name="lowStockThreshold"
              type="number"
              min={0}
              max={100000}
              defaultValue={pack?.lowStockThreshold ?? 10}
              required
              className={adminInput}
            />
          </Field>
        </div>
      </Section>

      <Section title="Visibility and shipping">
        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-semibold">Visibility</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value="active"
                  defaultChecked={(pack?.status ?? "active") === "active"}
                  className="accent-brand"
                />
                On sale
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value="hidden"
                  defaultChecked={pack?.status === "hidden"}
                  className="accent-brand"
                />
                Hidden (staff can still use it in “Create order”)
              </label>
            </div>
          </fieldset>
          <Field label="Position" hint="Lower numbers show first on the product page.">
            <input
              name="position"
              type="number"
              min={0}
              max={999}
              defaultValue={pack?.position ?? 10}
              required
              className={adminInput}
            />
          </Field>
          <Field label="Shipping weight (grams)">
            <input
              name="weightGrams"
              type="number"
              min={1}
              max={50000}
              defaultValue={pack?.weightGrams ?? 500}
              required
              className={adminInput}
            />
          </Field>
        </div>
      </Section>

      <button type="submit" className={buttonClasses("primary")}>
        {submitLabel}
      </button>
    </ActionForm>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
      <h2 className="font-bold">{title}</h2>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`grid content-start gap-1 text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}
