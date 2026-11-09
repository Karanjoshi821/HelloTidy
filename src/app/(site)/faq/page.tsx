import type { Metadata } from "next";
import Link from "next/link";
import { orderFaqs, productFaqs, allFaqs } from "@/config/faq";
import { FaqList } from "@/components/product/sections";
import { JsonLd } from "@/components/seo/json-ld";
import { Container } from "@/components/ui/layout";
import { getStorefront } from "@/lib/catalog/storefront";
import { isRazorpayEnabled } from "@/lib/payments/razorpay";
import { faqJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "FAQ: Magic Eraser Sponge, Delivery & Payments",
  description:
    "Answers about how magic cleaning sponges work, where to use them, delivery times, Cash on Delivery, cancellations and refunds.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const cod = { ...(await getStorefront()), onlinePayments: isRazorpayEnabled() };
  return (
    <Container className="max-w-3xl py-12 sm:py-16">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Frequently asked questions</h1>
      <p className="mt-3 text-muted">
        Can&apos;t find your answer?{" "}
        <Link href="/contact" className="font-semibold text-brand hover:underline">
          Contact us
        </Link>
        .
      </p>
      <h2 className="mt-10 mb-4 text-xl font-bold">About the product</h2>
      <FaqList faqs={productFaqs} />
      <h2 className="mt-10 mb-4 text-xl font-bold">Orders, delivery and payment</h2>
      <FaqList faqs={orderFaqs(cod)} />
      <JsonLd data={faqJsonLd(allFaqs(cod))} />
    </Container>
  );
}
