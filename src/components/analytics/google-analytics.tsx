"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { afterFirstInteraction } from "@/lib/analytics/first-interaction";
import { CONSENT_DENIED, CONSENT_GRANTED, GA_ID, startGtag } from "@/lib/analytics/gtag";
import { useConsent } from "@/lib/consent";
import { isPrivatePath } from "@/lib/visitors/attribution";

/**
 * Google Analytics 4, loaded only after the visitor accepts cookies, and never
 * on a visit that starts on an order page (its URL holds a private token; the
 * checkout leaves for that page with a full load while GA is running). The
 * library (about 150 KB) waits for the first interaction so it never slows the
 * first paint; events queue until then. Purchases are sent by the server
 * (Measurement Protocol).
 */
function Ga({ id }: { id: string }) {
  const pathname = usePathname();
  const [startedPrivate] = useState(() => isPrivatePath(pathname));
  const { choice } = useConsent();
  // Once loaded it stays for this page; only its consent can change.
  const [load, setLoad] = useState(false);
  if (choice === "granted" && !startedPrivate && !load) setLoad(true);
  const [library, setLibrary] = useState(false);

  useEffect(() => {
    if (!load) return;
    startGtag(id);
    return afterFirstInteraction(() => setLibrary(true));
  }, [load, id]);

  useEffect(() => {
    if (!load) return;
    const denied = choice !== "granted";
    (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = denied;
    window.gtag?.("consent", "update", denied ? CONSENT_DENIED : CONSENT_GRANTED);
  }, [load, choice, id]);

  if (!library) return null;
  return (
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />
  );
}

export function GoogleAnalytics() {
  if (!GA_ID) return null;
  // usePathname suspends on routes with unknown params (order pages) while prerendering.
  return (
    <Suspense fallback={null}>
      <Ga id={GA_ID} />
    </Suspense>
  );
}
