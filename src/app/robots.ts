import type { MetadataRoute } from "next";
import { absoluteUrl, siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  // Keep preview deployments out of search results.
  const isProductionDeploy = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production";
  if (!isProductionDeploy) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/checkout", "/order/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteConfig.url,
  };
}
