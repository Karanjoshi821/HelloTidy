import "server-only";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { notifyOwnerAlert } from "../notify";
import type { StockEffect } from "./inventory";
import { STOREFRONT_TAG } from "./storefront";

/**
 * Expires the cached storefront immediately: the next visitor gets fresh
 * prices, stock and COD settings. Works in Server Actions and Route Handlers
 * (where `updateTag` isn't available), so one helper serves both.
 */
export function expireStorefront(): void {
  revalidateTag(STOREFRONT_TAG, { expire: 0 });
}

/** Outside effects of a stock change: refresh pages showing availability, alert the owner. */
export function applyStockEffect(effect: StockEffect | null | undefined): void {
  if (!effect) return;
  if (effect.availabilityChanged) expireStorefront();
  if (effect.alerts.length) {
    const text = effect.alerts.join("\n");
    after(() => notifyOwnerAlert(text));
  }
}
