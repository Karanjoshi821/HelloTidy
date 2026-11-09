import type { CheckoutPaymentOptions } from "./flow";

/** Browser-side loader for Razorpay Checkout.js. */

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = { open: () => void; on: (event: string, cb: (response: unknown) => void) => void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<boolean> | null = null;

export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  loading ??= new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      loading = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return loading;
}

export function openRazorpay(
  options: CheckoutPaymentOptions,
  handlers: { onSuccess: (response: RazorpaySuccess) => void; onDismiss: () => void },
): void {
  if (!window.Razorpay) throw new Error("Razorpay is not loaded");
  const rzp = new window.Razorpay({
    key: options.keyId,
    amount: options.amount,
    currency: options.currency,
    name: options.name,
    description: options.description,
    order_id: options.razorpayOrderId,
    prefill: options.prefill,
    theme: { color: "#0f7a3c" },
    retry: { enabled: true },
    modal: { ondismiss: handlers.onDismiss, confirm_close: true },
    handler: handlers.onSuccess,
  });
  rzp.open();
}
