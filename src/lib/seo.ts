import { commerce, product } from "@/config/products";
import { absoluteUrl, isPlaceholder, siteConfig } from "@/config/site";
import type { Faq } from "@/config/faq";
import type { Review } from "@/config/reviews";
import type { Pack, Storefront } from "./catalog/types";

const rupees = (paise: number) => (paise / 100).toFixed(2);

/** schema.org builders. Only facts that are true and visible on the page go in here. */

export function organizationJsonLd() {
  const sameAs = Object.values(siteConfig.social).filter(Boolean);
  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": absoluteUrl("/#organization"),
    name: siteConfig.name,
    url: siteConfig.url,
    logo: absoluteUrl("/icon.png"),
  };
  if (!isPlaceholder(siteConfig.legalName)) org.legalName = siteConfig.legalName;
  if (sameAs.length) org.sameAs = sameAs;
  if (!isPlaceholder(siteConfig.contact.email) || !isPlaceholder(siteConfig.contact.phone)) {
    org.contactPoint = {
      "@type": "ContactPoint",
      contactType: "customer support",
      areaServed: "IN",
      availableLanguage: ["en", "hi"],
      ...(isPlaceholder(siteConfig.contact.email) ? {} : { email: siteConfig.contact.email }),
      ...(isPlaceholder(siteConfig.contact.phone) ? {} : { telephone: `+${siteConfig.contact.phone}` }),
    };
  }
  return org;
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    name: siteConfig.name,
    url: siteConfig.url,
    inLanguage: "en-IN",
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}

function offerFor(pack: Pack) {
  return {
    "@type": "Offer",
    name: `${pack.name} (${pack.count} sponges)`,
    sku: pack.sku,
    price: rupees(pack.price),
    priceCurrency: commerce.currency,
    availability: pack.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    url: absoluteUrl(`/products/${product.slug}?pack=${pack.id}`),
    seller: { "@id": absoluteUrl("/#organization") },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: "0", currency: commerce.currency },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
        transitTime: { "@type": "QuantitativeValue", minValue: 3, maxValue: 7, unitCode: "DAY" },
      },
    },
    // No change-of-mind returns (policies/refund); damaged or wrong items are replaced or refunded,
    // which isn't a return. Must match Merchant Center's return setting.
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "IN",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
      merchantReturnLink: absoluteUrl("/policies/refund"),
    },
  };
}

export function productJsonLd(storefront: Storefront, reviews: Review[]) {
  const { packs } = storefront;
  const prices = packs.map((p) => p.price);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    category: product.category,
    brand: { "@type": "Brand", name: siteConfig.name },
    material: "Melamine foam",
    image: product.images.length
      ? product.images.map((img) => absoluteUrl(img.src))
      : [absoluteUrl("/opengraph-image")],
    url: absoluteUrl(`/products/${product.slug}`),
  };
  // No packs listed: no offer at all (an empty AggregateOffer is invalid).
  if (packs.length) {
    data.offers = {
      "@type": "AggregateOffer",
      priceCurrency: commerce.currency,
      lowPrice: rupees(Math.min(...prices)),
      highPrice: rupees(Math.max(...prices)),
      offerCount: packs.length,
      offers: packs.map(offerFor),
    };
  }

  // Only real, published reviews. Never add ratings without them.
  if (reviews.length) {
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: avg.toFixed(1),
      reviewCount: reviews.length,
    };
    data.review = reviews.slice(0, 10).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.name },
      datePublished: r.date,
      reviewBody: r.text,
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
    }));
  }
  return data;
}

export function faqJsonLd(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function articleJsonLd(input: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified: string;
  /** Cover photo path, e.g. /images/uses/walls.webp */
  image: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    mainEntityOfPage: absoluteUrl(input.path),
    image: [absoluteUrl(input.image)],
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    author: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}
