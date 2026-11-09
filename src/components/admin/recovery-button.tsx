"use client";

import { useTransition } from "react";
import { markRecoverySentAction } from "@/app/admin/order-actions";
import { WhatsAppIcon } from "@/components/site/whatsapp-button";
import { buttonClasses } from "@/components/ui/button";

/**
 * Opens WhatsApp with a payment-reminder message and logs the reminder on the
 * order. The tab opens first, inside the click, so pop-up blockers allow it.
 */
export function RecoveryButton({
  orderId,
  href,
  sent,
  size = "sm",
}: {
  orderId: string;
  href: string;
  sent: number;
  size?: "sm" | "md";
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        window.open(href, "_blank", "noopener,noreferrer");
        startTransition(() => markRecoverySentAction(orderId));
      }}
      className={buttonClasses("whatsapp", size)}
    >
      <WhatsAppIcon className="size-4" />
      {sent ? `Remind again (${sent} sent)` : "Send payment reminder"}
    </button>
  );
}
