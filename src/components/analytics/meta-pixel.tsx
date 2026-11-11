"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PIXEL_ID, startPixel, trackPixel } from "@/lib/analytics/pixel";
import { useConsent } from "@/lib/consent";
import { isPrivatePath } from "@/lib/visitors/attribution";

/**
 * Loaded only after the visitor accepts cookies. Order pages carry a private
 * token in the URL (it unlocks the customer's name, phone and address), so the
 * pixel must never see them: it sends the full page URL with every event.
 * Purchases are reported server-side via the Conversions API as well.
 */
function Pixel({ id }: { id: string }) {
  const pathname = usePathname();
  // Not loaded at all when a visit starts on an order page.
  const [startedPrivate] = useState(() => isPrivatePath(pathname));
  const { choice } = useConsent();
  const [load, setLoad] = useState(false);
  if (choice === "granted" && !startedPrivate && !load) setLoad(true);

  // The base code tracks the first PageView; later route changes are tracked here.
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (!load) return;
    if (lastPath.current === null) {
      startPixel(id);
    } else if (lastPath.current !== pathname && !isPrivatePath(pathname)) {
      trackPixel("PageView");
    }
    lastPath.current = pathname;
  }, [load, id, pathname]);

  // Declining after accepting stops it for the rest of the page.
  const revoked = useRef(false);
  useEffect(() => {
    if (!load || !window.fbq) return;
    if (choice !== "granted") {
      window.fbq("consent", "revoke");
      revoked.current = true;
    } else if (revoked.current) {
      window.fbq("consent", "grant");
      revoked.current = false;
    }
  }, [load, choice]);

  return null;
}

export function MetaPixel() {
  if (!PIXEL_ID) return null;
  // usePathname suspends on routes with unknown params (order pages) while prerendering.
  return (
    <Suspense fallback={null}>
      <Pixel id={PIXEL_ID} />
    </Suspense>
  );
}
