import type { Metadata } from "next";
import Link from "next/link";
import { Check, HandCoins, RefreshCcw, Truck } from "lucide-react";
import { orderFaqs, productFaqs } from "@/config/faq";
import { product } from "@/config/products";
import { displayedReviews, genuineReviews } from "@/config/reviews";
import { displayedVideoReviews } from "@/config/video-reviews";
import { VideoReviewsSection } from "@/components/video-reviews";
import { siteConfig } from "@/config/site";
import { BeforeAfter } from "@/components/before-after";
import { DeliveryCheck } from "@/components/product/delivery-check";
import { BuyingGuide, OrderSteps } from "@/components/product/buying-guide";
import { ProductGallery } from "@/components/product/gallery";
import {
  BuyButtons,
  PackOptions,
  PackSelectionProvider,
  PackUpgradeNudge,
  PriceBlock,
  QtyStepper,
  SelectedOrderSummary,
  StickyBuyBar,
  ViewContentEvent,
} from "@/components/product/pack-picker";
import {
  AvoidList,
  CompareTable,
  FaqList,
  FinalCta,
  HowItWorks,
  SpecsTable,
  TrustStrip,
  UseCases,
} from "@/components/product/sections";
import { RatingInline, ReviewHighlight, ReviewsSection } from "@/components/reviews";
import { JsonLd } from "@/components/seo/json-ld";
import { Container, Section, SectionHeading } from "@/components/ui/layout";
import { getStorefront } from "@/lib/catalog/storefront";
import { lowestPrice, packSizesLabel } from "@/lib/catalog/types";
import { formatPaise } from "@/lib/money";
import { isRazorpayEnabled } from "@/lib/payments/razorpay";
import { breadcrumbJsonLd, faqJsonLd, productJsonLd } from "@/lib/seo";

/**
 * The folder name must equal product.slug in src/config/products.ts
 * (a test checks this), so every link to the product resolves.
 * Title, description and prices come from the live catalogue, so they never
 * advertise a pack size or price the store doesn't have.
 */
export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefront();
  const sizes = packSizesLabel(storefront);
  const from = lowestPrice(storefront);
  const title = sizes ? `Magic Eraser Sponge: Packs of ${sizes}` : "Magic Eraser Sponge";
  const description = `Melamine magic eraser sponges that remove crayon, scuffs, grime and soap scum with just water.${from !== null ? ` From ${formatPaise(from)}.` : ""} Free delivery, COD available.`;
  return {
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: { type: "website", url: `/products/${product.slug}`, title, description },
    twitter: { title, description },
  };
}

export default async function ProductPage() {
  const onlinePayments = isRazorpayEnabled();
  const storefront = await getStorefront();
  const faqs = [...productFaqs, ...orderFaqs({ ...storefront, onlinePayments })];
  const codCharge = storefront.codFee > 0 ? ` (+${formatPaise(storefront.codFee)} COD charge)` : "";

  return (
    <>
      <PackSelectionProvider>
        <Container className="pt-6 pb-12 sm:pt-8">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
            <ol className="flex items-center gap-2">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-ink" aria-current="page">
                {product.shortName}
              </li>
            </ol>
          </nav>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <ProductGallery />
            </div>

            <div id="buy">
              <h1 className="text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">
                {product.name}
              </h1>
              <p className="mt-2 text-lg text-muted">
                Melamine foam for everyday marks. Wet it, rub gently, wipe clean.
              </p>
              <div className="mt-3">
                <RatingInline />
              </div>

              <div className="mt-4">
                <PriceBlock />
              </div>

              <ul className="mt-4 space-y-2">
                {product.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-ink-soft">
                    <Check className="mt-0.5 size-5 shrink-0 text-success" /> {h}
                  </li>
                ))}
              </ul>

              <div id="choose-pack" className="mt-6 scroll-mt-24">
                <PackOptions />
                <PackUpgradeNudge />
              </div>
              <div className="mt-6">
                <QtyStepper />
              </div>
              <div className="mt-5">
                <SelectedOrderSummary onlinePayments={onlinePayments} />
              </div>
              <div className="mt-6">
                <BuyButtons id="buy-buttons" />
              </div>

              <ul className="mt-6 space-y-3 rounded-2xl border border-line p-4 text-sm">
                <li className="flex items-start gap-3">
                  <Truck className="mt-0.5 size-5 shrink-0 text-brand" />
                  <DeliveryCheck />
                </li>
                <li className="flex items-start gap-3">
                  <HandCoins className="mt-0.5 size-5 shrink-0 text-brand" />
                  <span>
                    {onlinePayments ? (
                      <>
                        <strong>Pay online</strong> with UPI, card or netbanking, or <strong>Cash on Delivery</strong>
                        {codCharge}.
                      </>
                    ) : (
                      <>
                        <strong>Cash on Delivery</strong> available{codCharge}. Pay when it arrives.
                      </>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <RefreshCcw className="mt-0.5 size-5 shrink-0 text-brand" />
                  <span>
                    Damaged or defective? Free replacement or refund within {siteConfig.shipping.claimWindowDays} days
                    of delivery.{" "}
                    <Link href="/policies/refund" className="font-semibold text-brand hover:underline">
                      Policy
                    </Link>
                  </span>
                </li>
              </ul>

              <BuyingGuide />
              <div className="mt-4">
                <ReviewHighlight />
              </div>
            </div>
          </div>
        </Container>
        <StickyBuyBar hideWhileVisibleId="buy-buttons" />
        <ViewContentEvent />
      </PackSelectionProvider>

      <Container className="pb-4">
        <TrustStrip />
      </Container>

      <Container className="py-5">
        <nav aria-label="Product sections" className="flex flex-wrap justify-center gap-2 text-sm font-semibold">
          {[
            ["#choose-pack", "Compare packs"],
            ["#results", "See results"],
            ...(displayedVideoReviews.length ? [["#video-reviews", "Videos"]] : []),
            ["#how-it-works", "How to use"],
            ...(displayedReviews.length ? [["#reviews", "Reviews"]] : []),
            ["#product-faq", "Questions"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full border border-line px-4 py-2 hover:bg-surface">
              {label}
            </a>
          ))}
        </nav>
      </Container>

      {/* Proof first: what it does, then who it worked for. */}
      <Section id="results">
        <div className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
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
              eyebrow="See the difference"
              title="Grime lifts off with just water"
              description={product.description}
            />
          </div>
        </div>
      </Section>

      <VideoReviewsSection title="See it work in real homes" />

      <Section className="bg-surface">
        <SectionHeading eyebrow="What it cleans" title="Made for everyday marks" />
        <UseCases />
      </Section>

      {displayedReviews.length > 0 && (
        <Section id="reviews">
          <SectionHeading eyebrow="Reviews" title="What customers say" />
          <ReviewsSection initialCount={4} />
        </Section>
      )}

      <Section id="how-it-works" className="bg-surface">
        <SectionHeading eyebrow="How to use" title="Wet. Rub. Wipe." />
        <HowItWorks />
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Why Hello Tidy"
          title="Less scrubbing, no chemicals"
          description="How a Hello Tidy sponge compares with the usual cloth and cleaner, including where it isn't the right tool."
        />
        <div className="mx-auto max-w-3xl">
          <CompareTable />
        </div>
        <div className="mx-auto mt-8 max-w-3xl">
          <AvoidList />
        </div>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="mb-6 text-2xl font-extrabold tracking-tight">Product details</h2>
            <SpecsTable />
          </div>
          <div id="product-faq" className="scroll-mt-24">
            <h2 className="mb-6 text-2xl font-extrabold tracking-tight">Before you buy: your questions answered</h2>
            <FaqList faqs={faqs} />
          </div>
        </div>
      </Section>

      <Section className="bg-surface">
        <SectionHeading eyebrow="From pack to doorstep" title="Know what happens next" />
        <OrderSteps />
      </Section>

      <Container className="pb-16 sm:pb-20">
        <FinalCta />
      </Container>

      <JsonLd
        data={[
          productJsonLd(storefront, genuineReviews),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: product.shortName, path: `/products/${product.slug}` },
          ]),
          faqJsonLd(faqs),
        ]}
      />
    </>
  );
}
