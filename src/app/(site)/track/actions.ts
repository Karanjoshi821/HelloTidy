"use server";

import { trackOrder, type TrackedOrder } from "@/lib/orders/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request";
import { fieldErrors, trackSchema } from "@/lib/validation";

export type TrackState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> }
  | { status: "found"; order: TrackedOrder };

export async function trackOrderAction(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const parsed = trackSchema.safeParse({
    orderNumber: formData.get("orderNumber"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Please check the details.", fieldErrors: fieldErrors(parsed.error) };
  }

  const ctx = await getRequestContext();
  // Tight limit: stops anyone from guessing order number + phone pairs.
  const limit = await rateLimit(`track:${ctx.ipHash}`, 10, 600);
  if (!limit.ok) return { status: "error", message: "Too many attempts. Please try again in a few minutes." };

  try {
    const order = await trackOrder(parsed.data.orderNumber, parsed.data.phone);
    if (!order) {
      return {
        status: "error",
        message: "We couldn't find an order with that number and phone. Check both and try again.",
      };
    }
    return { status: "found", order };
  } catch (error) {
    console.error("[track] failed:", error);
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}
