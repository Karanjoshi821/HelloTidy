import type { Metadata } from "next";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { updateCheckoutSettingsAction } from "@/app/admin/settings-actions";
import { ActionForm } from "@/components/admin/action-form";
import { SettingsTabs } from "@/components/admin/settings-tabs";
import { adminInput, Card, PageHeader } from "@/components/admin/ui";
import { buttonClasses } from "@/components/ui/button";
import { formattedAddress, isPlaceholder, siteConfig } from "@/config/site";
import { requireOwner } from "@/lib/auth/dal";
import { listPacksAdmin } from "@/lib/catalog/admin";
import { emailConfig, metaCapiConfig, orderWebhookConfig, razorpayConfig, telegramConfig } from "@/lib/env";
import { getLaunchChecklist } from "@/lib/launch-checklist";
import { formatPaise } from "@/lib/money";
import { getStoreSettings } from "@/lib/settings";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

/** Internal page: always rendered per request, navigation may block. */
export const instant = false;

function Check({ on }: { on: boolean }) {
  return on ? (
    <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Set" />
  ) : (
    <CircleDashed className="size-4 shrink-0 text-muted" aria-label="Not set" />
  );
}

export default async function SettingsPage() {
  await requireOwner();
  const [settings, packRows] = await Promise.all([getStoreSettings(), listPacksAdmin()]);
  const checklist = getLaunchChecklist({
    stockTracked: packRows.some((r) => r.pack.trackInventory && r.pack.status === "active"),
  });
  const razorpay = razorpayConfig();

  const details: { label: string; value: string }[] = [
    { label: "Store name", value: siteConfig.name },
    { label: "Registered business name", value: siteConfig.legalName },
    { label: "Phone", value: siteConfig.contact.phoneDisplay },
    { label: "WhatsApp", value: siteConfig.contact.whatsapp },
    { label: "Email", value: siteConfig.contact.email },
    { label: "Address", value: formattedAddress() },
    { label: "Grievance officer", value: `${siteConfig.grievanceOfficer.name} · ${siteConfig.grievanceOfficer.email}` },
    { label: "GSTIN", value: siteConfig.gstin || "Not registered (hidden on the site)" },
    { label: "Website", value: siteConfig.url },
  ];

  const integrations = [
    { name: "Razorpay online payments", on: Boolean(razorpay), hint: "RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET" },
    {
      name: "Razorpay webhook (backup confirmation)",
      on: Boolean(razorpay?.webhookSecret),
      hint: "RAZORPAY_WEBHOOK_SECRET",
    },
    { name: "Telegram new-order alerts", on: Boolean(telegramConfig()), hint: "TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID" },
    { name: "Emails (Resend)", on: Boolean(emailConfig()), hint: "RESEND_API_KEY, EMAIL_FROM, OWNER_EMAIL" },
    {
      name: "Meta Pixel + Conversions API",
      on: Boolean(metaCapiConfig()),
      hint: "NEXT_PUBLIC_META_PIXEL_ID, META_CAPI_ACCESS_TOKEN",
    },
    {
      name: "Order webhook (notification app)",
      on: Boolean(orderWebhookConfig()),
      hint: "ORDER_WEBHOOK_URL, ORDER_WEBHOOK_SECRET",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <SettingsTabs active="general" />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card
          title="Cash on Delivery"
          description="Used by checkout, the product page, FAQ and policy pages, which update as soon as you save."
        >
          <ActionForm action={updateCheckoutSettingsAction} className="grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              COD charge (₹)
              <input
                name="codFee"
                inputMode="decimal"
                defaultValue={String(settings.codFee / 100)}
                required
                className={adminInput}
              />
              <span className="text-xs font-normal text-muted">
                Added to COD orders and shown before ordering. ₹0 to make COD free.
              </span>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              COD available up to (₹ order total)
              <input
                name="codMaxOrderValue"
                inputMode="decimal"
                defaultValue={String(settings.codMaxOrderValue / 100)}
                required
                className={adminInput}
              />
              <span className="text-xs font-normal text-muted">
                Bigger orders must pay online. Limits fake bulk COD orders.
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={buttonClasses("primary", "sm")}>
                Save
              </button>
              <span className="text-xs text-muted">
                Now {formatPaise(settings.codFee)} up to {formatPaise(settings.codMaxOrderValue)}
                {settings.updatedBy ? ` · changed by ${settings.updatedBy}, ${formatDateTime(settings.updatedAt)}` : ""}
              </span>
            </div>
          </ActionForm>
        </Card>

        <Card title="Launch checklist">
          <ul className="space-y-2 text-sm">
            {checklist.map((item) => (
              <li key={item.id} className="flex gap-2">
                <Check on={item.done} />
                <span>
                  <span className={cn("font-semibold", item.done && "text-muted")}>{item.label}</span>
                  {!item.done && <span className="block text-xs text-muted">{item.help}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Store details"
          description="Shown on the contact page, policies, emails and Google. These are legal details, so they're edited in code (src/config/site.ts) and reviewed before going live."
        >
          <dl className="space-y-2 text-sm">
            {details.map((d) => (
              <div key={d.label} className="grid gap-0.5 sm:grid-cols-[11rem_1fr]">
                <dt className="text-muted">{d.label}</dt>
                <dd className={cn("break-words", d.value.includes("TODO") && "font-semibold text-warn")}>
                  {d.value.includes("TODO") ? "Not filled in yet" : d.value}
                </dd>
              </div>
            ))}
          </dl>
          {isPlaceholder(siteConfig.legalName) && (
            <p className="mt-3 text-xs text-warn">Fill these in before launch: the E-Commerce Rules require them.</p>
          )}
        </Card>

        <Card title="Integrations" description="Switched on with environment variables in Vercel (see README).">
          <ul className="space-y-2 text-sm">
            {integrations.map((i) => (
              <li key={i.name} className="flex gap-2">
                <Check on={i.on} />
                <span>
                  <span className={cn("font-semibold", !i.on && "text-muted")}>{i.name}</span>
                  {!i.on && <span className="block font-mono text-xs text-muted">{i.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
