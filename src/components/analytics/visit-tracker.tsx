"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { trackWhatsAppClick } from "@/lib/analytics/track";
import { startEngagement, trackPage } from "@/lib/visitors/tracker";

/** Every WhatsApp link on the store counts as a contact, wherever it sits. */
function onDocumentClick(event: MouseEvent) {
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return;
  if (!/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(link.href)) return;
  const where = link.closest("[data-track-where]")?.getAttribute("data-track-where") ?? window.location.pathname;
  trackWhatsAppClick(where.slice(0, 60));
}

function Tracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => startEngagement(), []);
  useEffect(() => {
    document.addEventListener("click", onDocumentClick, { capture: true });
    return () => document.removeEventListener("click", onDocumentClick, { capture: true });
  }, []);
  useEffect(() => {
    trackPage(search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);
  return null;
}

/** Our own visitor tracking (Admin → Visitors). Mounted once in the store layout, so it sees every navigation. */
export function VisitTracker() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
