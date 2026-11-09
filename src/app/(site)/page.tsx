import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeIndianRupee,
  Droplets,
  Eraser,
  FlaskConicalOff,
  HandCoins,
  RefreshCcw,
  Scissors,
  Sparkles,
  Truck,
} from "lucide-react";
import { productFaqs, orderFaqs } from "@/config/faq";
import { product } from "@/config/products";
import { siteConfig } from "@/config/site";
import {
  BuyButtons,
  PackOptions,
  PackSelectionProvider,
  PriceBlock,
  StickyBuyBar,
} from "@/components/product/pack-picker";
import { AvoidList, FaqList, HowItWorks, TrustStrip, UseCases } from "@/components/product/sections";
import { BeforeAfter } from "@/components/before-after";
import { ReviewsSection } from "@/components/reviews";
import { JsonLd } from "@/components/seo/json-ld";
import { LinkButton } from "@/components/ui/button";
import { Container, Section, SectionHeading } from "@/components/ui/layout";
import { getStorefront } from "@/lib/catalog/storefront";
import { isRazorpayEnabled } from "@/lib/payments/razorpay";
import { lowestPerPiece, lowestPrice, type Storefront } from "@/lib/catalog/types";
import { formatPaise } from "@/lib/money";
import { faqJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** The value claim is built from live prices, so it can never promise a price the store doesn't have. */
function valueText(storefront: Storefront): string {
  const counts = storefront.packs.map((p) => p.count);
  const each = lowestPerPiece(storefront);
  if (!counts.length || each === null) return "Packs for every home, big or small.";
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const range = min === max ? `Packs of ${min} sponges` : `Packs from ${min} to ${max} sponges`;
  return `${range}, from about ${formatPaise(Math.round(each / 100) * 100)} each.`;
}

export default async function HomePage() {
  const productHref = `/products/${product.slug}`;
  const storefront = await getStorefront();
  const from = lowestPrice(storefront);
  const homeFaqs = [
    ...productFaqs.slice(0, 3),
    ...orderFaqs({ ...storefront, onlinePayments: isRazorpayEnabled() }).slice(0, 3),
  ];
  const benefits = [
    { icon: FlaskConicalOff, title: "No chemicals", text: "Just water. No harsh cleaners or fumes in your home." },
    { icon: Eraser, title: "Tough on marks", text: "Lifts crayon, scuffs and grime that cloths leave behind." },
    { icon: Scissors, title: "Cut to size", text: "Snip into small pieces for corners, grooves and grout." },
    { icon: BadgeIndianRupee, title: "Great value", text: valueText(storefront) },
  ];
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-soft/70 to-white">
        <Container className="grid items-center gap-8 py-10 sm:py-14 md:grid-cols-2 lg:gap-12 lg:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand shadow-card">
              <Sparkles className="size-4" /> Magic cleaning sponge
            </p>
            <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Erase tough stains. <span className="text-brand">With just water.</span>
            </h1>
            <p className="mt-3 text-lg font-semibold text-ink-soft">{product.tagline}</p>
            <p className="mt-4 max-w-lg text-lg text-pretty text-muted">
              Crayon on walls, grimy switchboards, soap scum, scuffed sneakers — wet the sponge, rub gently, done.
            </p>
            <div id="hero-cta" className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton href={productHref} size="lg">
                Shop now{from !== null && <> — from {formatPaise(from)}</>} <ArrowRight className="size-5" />
              </LinkButton>
              <LinkButton href="#how-it-works" size="lg" variant="outline">
                See how it works
              </LinkButton>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-soft">
              <li className="flex items-center gap-1.5">
                <Truck className="size-4 text-brand" /> Free delivery
              </li>
              <li className="flex items-center gap-1.5">
                <HandCoins className="size-4 text-brand" /> Cash on Delivery
              </li>
              <li className="flex items-center gap-1.5">
                <RefreshCcw className="size-4 text-brand" /> {siteConfig.shipping.claimWindowDays}-day replacement
              </li>
            </ul>
          </div>
          <div className="relative">
            <Image
              src="/images/hero.webp"
              alt="Hand wiping a child's crayon drawing off a wall with a white magic sponge"
              width={1536}
              height={1024}
              loading="eager"
              fetchPriority="high"
              sizes="(min-width: 768px) 50vw, 100vw"
              className="aspect-[3/2] w-full rounded-[2rem] object-cover shadow-card"
            />
            <span className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-bold shadow-card">
              <Droplets className="size-4 text-brand" /> Just add water
            </span>
          </div>
        </Container>
      </section>

      <Container className="pt-2 pb-4">
        <TrustStrip />
      </Container>

      {/* Before / after */}
      <Section>
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="order-2 md:order-1">
            <BeforeAfter
              before={{
                src: "/images/compare/switchboard-dirty.webp",
                alt: "Switchboard and wall covered in grey finger marks and grime, before cleaning",
                width: 1536,
                height: 1024,
              }}
              after={{
                src: "/images/compare/switchboard-clean.webp",
                alt: "The same switchboard and wall, spotless after cleaning with a magic sponge",
                width: 1536,
                height: 1024,
              }}
            />
            <p className="mt-3 text-center text-sm text-muted">Drag the slider to see the difference</p>
          </div>
          <div className="order-1 md:order-2">
            <SectionHeading
              align="left"
              eyebrow="Why it works"
              title="Like an eraser, for your whole home"
              description="Melamine foam has a micro-fine, hard structure. Wet it and it gently lifts stains off the surface — the way an eraser lifts pencil — so you don't need soap or scrubbing."
            />
            <ul className="grid grid-cols-2 gap-4">
              {benefits.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <Icon className="mb-2 size-5 text-brand" />
                  <p className="font-bold">{title}</p>
                  <p className="text-sm text-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section className="bg-surface">
        <SectionHeading eyebrow="What it cleans" title="One sponge, a hundred stubborn marks" />
        <UseCases />
      </Section>

      <Section id="how-it-works">
        <SectionHeading eyebrow="How to use" title="Wet. Rub. Wipe. That's it." />
        <HowItWorks />
      </Section>

      {/* Packs */}
      <Section id="packs" className="bg-ink text-white">
        <PackSelectionProvider>
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="mb-2 text-sm font-semibold tracking-wide text-mint uppercase">Choose your pack</p>
              <h2 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
                Stock up and save more per sponge
              </h2>
              <p className="mt-3 text-lg text-white/70">
                Every pack ships free. Pay online, or choose Cash on Delivery.
              </p>
              <div className="relative mx-auto mt-8 hidden max-w-sm lg:block">
                <div className="absolute inset-8 rounded-full bg-brand/40 blur-3xl" aria-hidden="true" />
                <Image
                  src={product.cutout.src}
                  alt="A stack of Hello Tidy magic cleaning sponges"
                  width={product.cutout.width}
                  height={product.cutout.height}
                  sizes="384px"
                  className="relative w-full"
                />
              </div>
            </div>
            <div className="rounded-3xl bg-white p-5 text-ink sm:p-8">
              <PriceBlock />
              <div className="my-6">
                <PackOptions />
              </div>
              <BuyButtons id="packs-buy" />
            </div>
          </div>
          <StickyBuyBar showAfterId="hero-cta" hideWhileVisibleId="packs-buy" />
        </PackSelectionProvider>
      </Section>

      <Section>
        <AvoidList />
      </Section>

      <Section id="reviews" className="bg-surface">
        <SectionHeading eyebrow="Reviews" title="What customers say" />
        <ReviewsSection limit={3} moreHref={`${productHref}#reviews`} />
      </Section>

      <Section>
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mx-auto max-w-3xl">
          <FaqList faqs={homeFaqs} />
          <p className="mt-6 text-center text-muted">
            More questions? See the{" "}
            <Link href="/faq" className="font-semibold text-brand hover:underline">
              full FAQ
            </Link>{" "}
            or{" "}
            <Link href="/contact" className="font-semibold text-brand hover:underline">
              contact us
            </Link>
            .
          </p>
        </div>
      </Section>

      <Section className="pt-0 sm:pt-0">
        <div className="relative overflow-hidden rounded-[2rem] bg-brand px-6 py-12 text-center text-white sm:px-12">
          <h2 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
            Make the stubborn stains disappear
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-white">
            Free delivery across India. Cash on Delivery available.
          </p>
          <LinkButton href={productHref} size="lg" variant="secondary" className="mt-8">
            Shop now <ArrowRight className="size-5" />
          </LinkButton>
        </div>
      </Section>

      <JsonLd data={faqJsonLd(homeFaqs)} />
    </>
  );
}
