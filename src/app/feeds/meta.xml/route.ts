import { getStorefront } from "@/lib/catalog/storefront";
import { productFeed } from "@/lib/feeds";

/** Product feed for Meta Commerce Manager (Instagram/Facebook catalog). Add it as a scheduled data feed. */
export async function GET() {
  const xml = productFeed(await getStorefront(), "meta");
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
