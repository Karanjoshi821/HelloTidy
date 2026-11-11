import { analyticsAllowed } from "../consent";

/** Browser-side Google Analytics 4 helpers. Safe to call when GA is off or not allowed. */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const rawId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
/** Only a well-formed id is accepted. */
export const GA_ID = /^G-[A-Z0-9]{4,16}$/.test(rawId) ? rawId : null;

export const CONSENT_GRANTED = {
  ad_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
  analytics_storage: "granted",
} as const;

export const CONSENT_DENIED = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
} as const;

/**
 * Events fired on this page before GA started (a page's own effects run
 * before the tag's). Only kept when the visitor has already accepted; events
 * from before an Accept are never sent.
 */
const pending: [string, Record<string, unknown>][] = [];

export function gtagEvent(name: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  if (window.gtag) window.gtag("event", name, params);
  else if (GA_ID && analyticsAllowed()) pending.push([name, params]);
}

/** Google's gtag snippet: the queue the library reads once it loads. Then the events that were waiting. */
export function startGtag(id: string): void {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js only reads Arguments objects from the queue.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", CONSENT_GRANTED);
  window.gtag("js", new Date());
  window.gtag("config", id);
  for (const [name, params] of pending.splice(0)) window.gtag("event", name, params);
}
