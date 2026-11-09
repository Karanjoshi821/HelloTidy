/** Browser-side Meta Pixel helpers. Safe to call when the pixel is disabled. */

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

const rawPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
/** Only digits are accepted, since the id is written into an inline script. */
export const PIXEL_ID = /^\d{5,20}$/.test(rawPixelId) ? rawPixelId : null;

export function trackPixel(event: string, params?: Record<string, unknown>, eventId?: string): void {
  if (typeof window === "undefined" || !window.fbq) return;
  if (eventId) window.fbq("track", event, params ?? {}, { eventID: eventId });
  else window.fbq("track", event, params ?? {});
}
