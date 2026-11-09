"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PIXEL_ID, trackPixel } from "@/lib/analytics/pixel";

/**
 * Order pages carry a private token in the URL (it unlocks the customer's
 * name, phone and address), so the pixel must never see them: it sends the
 * full page URL with every event. Purchases from those pages are reported
 * server-side via the Conversions API instead.
 */
const isPrivatePath = (path: string) => path.startsWith("/order/");

function PageViews({ pathname }: { pathname: string }) {
  const first = useRef(true);
  useEffect(() => {
    // The base code already tracks the first PageView.
    if (first.current) {
      first.current = false;
      return;
    }
    if (!isPrivatePath(pathname)) trackPixel("PageView");
  }, [pathname]);
  return null;
}

function Pixel() {
  const pathname = usePathname();
  // Not loaded at all when a visit starts on an order page.
  const [startedPrivate] = useState(() => isPrivatePath(pathname));
  if (!PIXEL_ID || startedPrivate) return null;
  return (
    <>
      {/* disablePushState stops the pixel from auto-tracking URL changes; PageViews does it, skipping private pages. */}
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq.disablePushState=true;fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
      </Script>
      <PageViews pathname={pathname} />
    </>
  );
}

export function MetaPixel() {
  if (!PIXEL_ID) return null;
  return (
    <Suspense fallback={null}>
      <Pixel />
    </Suspense>
  );
}
