import type { MetadataRoute } from "next";
import { product } from "@/config/products";
import { absoluteUrl, siteConfig } from "@/config/site";
import { guides } from "@/content/guides";
import { policies } from "@/content/policies";

export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date(siteConfig.policiesUpdated);
  return [
    { url: absoluteUrl("/"), lastModified: updated, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl(`/products/${product.slug}`), lastModified: updated, changeFrequency: "weekly", priority: 0.9 },
    { url: absoluteUrl("/guides"), lastModified: updated, changeFrequency: "monthly", priority: 0.6 },
    ...guides.map((g) => ({
      url: absoluteUrl(`/guides/${g.slug}`),
      lastModified: new Date(g.updated),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: absoluteUrl("/faq"), lastModified: updated, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/about"), lastModified: updated, changeFrequency: "yearly", priority: 0.4 },
    { url: absoluteUrl("/contact"), lastModified: updated, changeFrequency: "yearly", priority: 0.4 },
    { url: absoluteUrl("/track"), lastModified: updated, changeFrequency: "yearly", priority: 0.3 },
    ...policies.map((p) => ({
      url: absoluteUrl(`/policies/${p.slug}`),
      lastModified: updated,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];
}
