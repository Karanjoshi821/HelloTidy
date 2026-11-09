import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, BadgeCheck, FlaskConicalOff, HeartHandshake } from "lucide-react";
import { product } from "@/config/products";
import { siteConfig } from "@/config/site";
import { LinkButton } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";

export const metadata: Metadata = {
  title: "About Us",
  description: `${siteConfig.name} makes cleaning simpler: magic cleaning sponges that remove tough stains with just water.`,
  alternates: { canonical: "/about" },
};

const values = [
  {
    icon: FlaskConicalOff,
    title: "Less chemicals",
    text: "Most everyday marks don't need harsh cleaners. Water and the right sponge are often enough.",
  },
  {
    icon: BadgeCheck,
    title: "Honest selling",
    text: "We tell you where our sponges work and where they don't. No fake timers, no invented reviews.",
  },
  {
    icon: HeartHandshake,
    title: "Easy to buy",
    text: "Free delivery across India, Cash on Delivery, and quick help on WhatsApp if anything goes wrong.",
  },
];

export default function AboutPage() {
  return (
    <Container className="max-w-4xl py-12 sm:py-16">
      <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">
        Cleaning shouldn&apos;t need a cupboard full of chemicals
      </h1>
      <Image
        src="/images/product/product-in-use.webp"
        alt="Wiping crayon off a wall with a Hello Tidy sponge"
        width={1024}
        height={1024}
        loading="eager"
        fetchPriority="high"
        sizes="(min-width: 896px) 896px, 100vw"
        className="mt-8 aspect-[16/9] w-full rounded-3xl object-cover"
      />
      <div className="prose-brand mt-8 text-lg">
        <p>
          <strong>{siteConfig.name}</strong> makes clever, honest fixes for everyday homes. We started with one simple
          product we love: the melamine foam &quot;magic&quot; sponge. Add water, rub gently, and crayon on the walls,
          grimy switchboards and soap scum simply lift away.
        </p>
        <p>
          We sell directly to you, so we can keep prices fair, deliver free across India and stay close to your
          feedback.
        </p>
      </div>
      <ul className="mt-12 grid gap-5 sm:grid-cols-3">
        {values.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-3xl bg-surface p-6">
            <Icon className="mb-3 size-6 text-brand" />
            <h2 className="font-bold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ul>
      <LinkButton href={`/products/${product.slug}`} size="lg" className="mt-12">
        Shop sponges <ArrowRight className="size-5" />
      </LinkButton>
    </Container>
  );
}
