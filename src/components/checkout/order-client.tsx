"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { confirmPaymentAction, retryPaymentAction, switchToCodAction } from "@/app/(site)/checkout/actions";
import { loadRazorpay, openRazorpay } from "@/lib/payments/razorpay-client";
import { buttonClasses } from "../ui/button";

export function PendingPaymentActions({
  orderToken,
  totalLabel,
  codLabel,
  codAvailable,
}: {
  orderToken: string;
  totalLabel: string;
  codLabel: string;
  codAvailable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function payNow() {
    setError(null);
    startTransition(async () => {
      const res = await retryPaymentAction(orderToken);
      if (!res.ok) {
        setError(res.error);
        router.refresh();
        return;
      }
      if (!(await loadRazorpay())) {
        setError("The payment window couldn't load. Check your connection and try again.");
        return;
      }
      openRazorpay(res.payment, {
        onSuccess: (response) =>
          startTransition(async () => {
            const result = await confirmPaymentAction({
              orderToken,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            if (!result.ok) setError(result.error);
            router.refresh();
          }),
        onDismiss: () => undefined,
      });
    });
  }

  function useCod() {
    setError(null);
    startTransition(async () => {
      const res = await switchToCodAction(orderToken);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={payNow} disabled={pending} className={buttonClasses("primary", "lg", "w-full")}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : `Pay ${totalLabel} now`}
      </button>
      {codAvailable && (
        <button type="button" onClick={useCod} disabled={pending} className={buttonClasses("outline", "lg", "w-full")}>
          Pay on delivery instead ({codLabel})
        </button>
      )}
      {error && (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
