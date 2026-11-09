import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { loadStorefront } from "./service";
import type { Storefront } from "./types";

/** Cache tag for everything public pages show from the database (packs, prices, COD settings). */
export const STOREFRONT_TAG = "storefront";

/**
 * The catalogue for public pages, cached so they stay in the static shell.
 * Admin edits and sell-outs expire it immediately (see ./invalidate.ts); the
 * hourly revalidation is only a safety net.
 */
export async function getStorefront(): Promise<Storefront> {
  "use cache";
  cacheTag(STOREFRONT_TAG);
  cacheLife("hours");
  return loadStorefront();
}
