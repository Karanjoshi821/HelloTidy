"use client";

import { useSyncExternalStore } from "react";
import { siteConfig } from "@/config/site";
import { deliveryWindow, formatDeliveryDate, indiaDateKey } from "@/lib/delivery";

const noopSubscribe = () => () => undefined;

/**
 * "Free delivery between Tue, 4 Nov and Mon, 10 Nov". The page is cached, so
 * the dates are worked out in the browser; the server renders the plain range
 * ("in 3–7 working days") in the same space, so nothing shifts when it swaps.
 */
export function DeliveryEstimate() {
  const today = useSyncExternalStore(
    noopSubscribe,
    () => indiaDateKey(new Date()),
    () => null,
  );
  const { dispatch, delivery, deliveryDays } = siteConfig.shipping;
  if (!today) {
    return (
      <>
        <strong>Free delivery</strong> in {delivery}. Dispatched within {dispatch}.
      </>
    );
  }
  const { from, to } = deliveryWindow(today, deliveryDays);
  return (
    <>
      <strong>Free delivery</strong> between{" "}
      <strong>
        {formatDeliveryDate(from)} and {formatDeliveryDate(to)}
      </strong>
      . Dispatched within {dispatch}.
    </>
  );
}
