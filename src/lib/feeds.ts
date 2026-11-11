import { product } from "@/config/products";
import { absoluteUrl, siteConfig } from "@/config/site";
import type { Pack, Storefront } from "./catalog/types";

/**
 * Product feeds (RSS 2.0 with Google's g: fields), built live from the packs
 * in the database, one item per visible pack.
 * - Google Merchant Center (free listings): price is the selling price and
 *   the printed MRP goes in maximum_retail_price, India's own field.
 * - Meta Commerce Manager: price is the MRP and sale_price the selling price,
 *   so Instagram and Facebook show the saving.
 */

export type FeedFlavor = "google" | "meta";

/** Google's product category: Home & Garden > Household Supplies > Household Cleaning Supplies > Sponges & Scouring Pads. */
export const GOOGLE_CATEGORY_ID = "2796";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const amount = (paise: number) => `${(paise / 100).toFixed(2)} INR`;

function tag(name: string, value: string | number): string {
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

function item(pack: Pack, flavor: FeedFlavor): string {
  const [main, ...more] = product.images;
  const title = `${product.name}, ${pack.name} (${pack.count} sponges)`.slice(0, 150);
  const description = `${product.description} ${product.highlights.join(". ")}.`.slice(0, 5000);
  const availability =
    flavor === "google" ? (pack.available ? "in_stock" : "out_of_stock") : pack.available ? "in stock" : "out of stock";
  const discounted = pack.mrp > pack.price;

  const fields = [
    tag("g:id", pack.sku),
    tag("g:title", title),
    tag("g:description", description),
    tag("g:link", absoluteUrl(`/products/${product.slug}?pack=${pack.id}`)),
    main ? tag("g:image_link", absoluteUrl(main.src)) : "",
    ...more.slice(0, 10).map((img) => tag("g:additional_image_link", absoluteUrl(img.src))),
    tag("g:availability", availability),
    tag("g:condition", "new"),
    tag("g:brand", siteConfig.name),
    tag("g:google_product_category", GOOGLE_CATEGORY_ID),
    tag("g:product_type", `Home cleaning > Magic eraser sponges > ${pack.name}`),
    ...(flavor === "google"
      ? [
          tag("g:price", amount(pack.price)),
          tag("g:maximum_retail_price", amount(pack.mrp)),
          tag("g:identifier_exists", "no"),
        ]
      : [
          tag("g:price", amount(discounted ? pack.mrp : pack.price)),
          discounted ? tag("g:sale_price", amount(pack.price)) : "",
        ]),
    `<g:shipping>${tag("g:country", "IN")}${tag("g:price", amount(0))}</g:shipping>`,
  ];
  return `<item>${fields.filter(Boolean).join("")}</item>`;
}

export function productFeed(storefront: Pick<Storefront, "packs">, flavor: FeedFlavor): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    tag("title", `${siteConfig.name} products`),
    tag("link", siteConfig.url),
    tag("description", siteConfig.shortDescription),
    ...storefront.packs.map((p) => item(p, flavor)),
    "</channel>",
    "</rss>",
  ].join("\n");
}
