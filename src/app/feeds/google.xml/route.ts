import { getStorefront } from "@/lib/catalog/storefront";
import { productFeed } from "@/lib/feeds";

/** Product feed for Google Merchant Center (free listings). Add this URL as a scheduled fetch in Merchant Center. */
export async function GET() {
  const xml = productFeed(await getStorefront(), "google");
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
