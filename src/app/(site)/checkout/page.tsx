import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutForm, CheckoutSkeleton } from "@/components/checkout/checkout-form";
import { Container } from "@/components/ui/layout";
import { isRecoveryEnabled } from "@/lib/env";
import { isRazorpayEnabled } from "@/lib/payments/razorpay";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
  alternates: { canonical: "/checkout" },
};

export default function CheckoutPage() {
  return (
    <Container className="py-8 sm:py-12">
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutForm onlinePayments={isRazorpayEnabled()} recoveryCalls={isRecoveryEnabled()} />
      </Suspense>
    </Container>
  );
}
