import type { Metadata } from "next";
import Link from "next/link";
import { TrackForm } from "@/components/track-form";
import { Container } from "@/components/ui/layout";

export const metadata: Metadata = {
  title: "Track Your Order",
  description: "Check the status of your Hello Tidy order with your order number and phone number.",
  alternates: { canonical: "/track" },
};

export default function TrackPage() {
  return (
    <Container className="max-w-xl py-12 sm:py-16">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Track your order</h1>
      <p className="mt-2 mb-8 text-muted">
        Enter your order number and the mobile number you ordered with. Can&apos;t find your order number?{" "}
        <Link href="/contact" className="font-semibold text-brand hover:underline">
          Contact us
        </Link>
        .
      </p>
      <TrackForm />
    </Container>
  );
}
