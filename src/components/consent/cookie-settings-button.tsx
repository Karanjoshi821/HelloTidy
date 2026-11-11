"use client";

import { openCookieSettings } from "@/lib/consent";

/** Reopens the cookie banner, as the privacy policy promises. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      Cookie settings
    </button>
  );
}
