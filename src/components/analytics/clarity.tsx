"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useConsent } from "@/lib/consent";
import { isPrivatePath } from "@/lib/visitors/attribution";

const rawId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() ?? "";
/** Only a well-formed id is accepted, since it is written into an inline script. */
const CLARITY_ID = /^[a-z0-9]{6,20}$/i.test(rawId) ? rawId : null;

const GRANTED = { ad_Storage: "granted", analytics_Storage: "granted" };
const DENIED = { ad_Storage: "denied", analytics_Storage: "denied" };

/**
 * Microsoft Clarity (heatmaps and session recordings), loaded only after the
 * visitor accepts cookies, and never on a visit that starts on an order page.
 * Personal details are hidden from recordings: the checkout form and order
 * details carry data-clarity-mask, and Clarity masks typed input by default.
 */
function ClarityTag({ id }: { id: string }) {
  const pathname = usePathname();
  const [startedPrivate] = useState(() => isPrivatePath(pathname));
  const { choice } = useConsent();
  const [load, setLoad] = useState(false);
  if (choice === "granted" && !startedPrivate && !load) setLoad(true);

  useEffect(() => {
    if (load) window.clarity?.("consentv2", choice === "granted" ? GRANTED : DENIED);
  }, [load, choice]);

  if (!load) return null;
  return (
    <Script id="microsoft-clarity" strategy="lazyOnload">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};c[a]('consentv2',${JSON.stringify(GRANTED)});t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(id)});`}
    </Script>
  );
}

export function Clarity() {
  if (!CLARITY_ID) return null;
  // usePathname suspends on routes with unknown params (order pages) while prerendering.
  return (
    <Suspense fallback={null}>
      <ClarityTag id={CLARITY_ID} />
    </Suspense>
  );
}
