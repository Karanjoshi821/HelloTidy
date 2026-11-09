"use client";

import { useEffect } from "react";

const KEY = "hellotidy_attribution_v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type Attribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPath?: string;
  referrer?: string;
};

type Stored = Attribution & { ts: number };

const clip = (v: string | null | undefined, max = 150) => (v ? v.slice(0, max) : undefined);

/**
 * Remembers which ad (UTM tags) brought the visitor, so each order records
 * its campaign. Last paid touch wins; kept for 30 days in this browser only.
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const hasUtm = ["utm_source", "utm_medium", "utm_campaign", "fbclid"].some((k) => params.has(k));
      if (!hasUtm) return;
      const value: Stored = {
        utmSource: clip(params.get("utm_source") ?? (params.has("fbclid") ? "facebook" : null)),
        utmMedium: clip(params.get("utm_medium") ?? (params.has("fbclid") ? "paid_social" : null)),
        utmCampaign: clip(params.get("utm_campaign")),
        utmContent: clip(params.get("utm_content")),
        utmTerm: clip(params.get("utm_term")),
        landingPath: clip(window.location.pathname, 300),
        referrer: clip(document.referrer, 300),
        ts: Date.now(),
      };
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      // Storage can be unavailable (private mode); attribution is best-effort.
    }
  }, []);
  return null;
}

export function readAttribution(): Attribution | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const { ts, ...rest } = JSON.parse(raw) as Stored;
    if (!ts || Date.now() - ts > MAX_AGE_MS) return undefined;
    return rest;
  } catch {
    return undefined;
  }
}
