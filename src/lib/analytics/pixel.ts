import { analyticsAllowed } from "../consent";

/** Browser-side Meta Pixel helpers. Safe to call when the pixel is disabled or not allowed. */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
  disablePushState?: boolean;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

const rawPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
/** Only digits are accepted. */
export const PIXEL_ID = /^\d{5,20}$/.test(rawPixelId) ? rawPixelId : null;

/** Events fired before the pixel started on this page; only kept once the visitor has accepted. */
const pending: [string, Record<string, unknown> | undefined, string | undefined][] = [];

export function trackPixel(event: string, params?: Record<string, unknown>, eventId?: string): void {
  if (typeof window === "undefined") return;
  if (!window.fbq) {
    if (PIXEL_ID && analyticsAllowed()) pending.push([event, params, eventId]);
    return;
  }
  if (eventId) window.fbq("track", event, params ?? {}, { eventID: eventId });
  else window.fbq("track", event, params ?? {});
}

/**
 * Meta's base code, unchanged in behaviour: a queue, then fbevents.js.
 * disablePushState stops it from tracking URL changes itself; the Pixel
 * component sends PageView on route changes, skipping order pages.
 */
export function startPixel(id: string): void {
  if (window.fbq) return;
  const n = function (this: unknown) {
    // fbevents.js reads Arguments objects from the queue.
    // eslint-disable-next-line prefer-rest-params
    const args = arguments;
    if (n.callMethod) n.callMethod(...args);
    else n.queue.push(args);
  } as unknown as Fbq;
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = "2.0";
  n.queue = [];
  n.disablePushState = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  n("init", id);
  n("track", "PageView");
  for (const [event, params, eventId] of pending.splice(0)) trackPixel(event, params, eventId);
}
