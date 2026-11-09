import { allFaqs } from "@/config/faq";
import { product } from "@/config/products";
import { absoluteUrl, siteConfig } from "@/config/site";
import { guides } from "@/content/guides";
import { getStorefront } from "@/lib/catalog/storefront";
import { isRazorpayEnabled } from "@/lib/payments/razorpay";
import { formatPaise } from "@/lib/money";

/** llms.txt (https://llmstxt.org): a plain summary for AI assistants and AI search. */
export async function GET() {
  const storefront = await getStorefront();
  const packLines = storefront.packs.map(
    (p) =>
      `- ${p.name}: ${p.count} sponges for ${formatPaise(p.price)} (MRP ${formatPaise(p.mrp)})${p.available ? "" : " (out of stock)"}`,
  );
  const cod = storefront.codFee > 0 ? `with a ${formatPaise(storefront.codFee)} COD charge` : "with no extra charge";

  const body = `# ${siteConfig.name}

> ${siteConfig.shortDescription}

${siteConfig.name} sells ${product.name}: ${product.description}

## Packs and prices (INR, inclusive of GST, free delivery)
${packLines.join("\n")}
- Cash on Delivery available up to ${formatPaise(storefront.codMaxOrderValue)} ${cod}.
- Delivery: dispatched within ${siteConfig.shipping.dispatch}, delivered in ${siteConfig.shipping.delivery}, across India.

## Key pages
- [Shop](${absoluteUrl(`/products/${product.slug}`)}): product details, specs and safety notes
- [FAQ](${absoluteUrl("/faq")})
- [Shipping policy](${absoluteUrl("/policies/shipping")})
- [Cancellation & refund policy](${absoluteUrl("/policies/refund")})
- [Contact](${absoluteUrl("/contact")})

## Guides
${guides.map((g) => `- [${g.title}](${absoluteUrl(`/guides/${g.slug}`)}): ${g.description}`).join("\n")}

## Where not to use it
${product.avoid.map((a) => `- ${a}`).join("\n")}

## FAQ
${allFaqs({ ...storefront, onlinePayments: isRazorpayEnabled() })
  .map((f) => `### ${f.q}\n${f.a}`)
  .join("\n\n")}
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
