import type { ReactNode } from "react";
import { AttributionCapture } from "@/components/analytics/attribution";
import { MetaPixel } from "@/components/analytics/meta-pixel";
import { CartProvider } from "@/components/cart/cart-context";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { JsonLd } from "@/components/seo/json-ld";
import { StorefrontProvider } from "@/components/storefront-context";
import { getStorefront } from "@/lib/catalog/storefront";
import { isRazorpayEnabled } from "@/lib/payments/razorpay";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { Footer } from "./footer";
import { AnnouncementBar, Header } from "./header";
import { WhatsAppFloat } from "./whatsapp-button";

/** Storefront chrome: header, footer, cart, WhatsApp and tracking. Used by the store layout and the 404 page. */
export async function SiteShell({ children }: { children: ReactNode }) {
  const storefront = await getStorefront();
  const onlinePayments = isRazorpayEnabled();
  return (
    <StorefrontProvider value={storefront}>
      <CartProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <AnnouncementBar onlinePayments={onlinePayments} />
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <WhatsAppFloat />
        <CartDrawer onlinePayments={onlinePayments} />
        <AttributionCapture />
        <MetaPixel />
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      </CartProvider>
    </StorefrontProvider>
  );
}
