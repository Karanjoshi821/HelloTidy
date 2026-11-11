"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CircleCheck, CircleX, MapPin } from "lucide-react";
import { siteConfig, whatsappLink } from "@/config/site";
import { courierDeliveryRange, deliveryWindow, formatDeliveryDate, indiaDateKey } from "@/lib/delivery";
import { DeliveryEstimate } from "./delivery-estimate";
import { buttonClasses } from "../ui/button";

/** Shared with checkout, so a pincode typed here is remembered there. */
export const PINCODE_KEY = "hellotidy_pincode_v1";

export type DeliveryResult =
  | { ok: false }
  | {
      ok: true;
      serviceable: boolean | null;
      cod: boolean | null;
      courierDays: number | null;
      city: string | null;
      state: string | null;
    };

export async function fetchDelivery(pin: string): Promise<DeliveryResult | null> {
  try {
    const res = await fetch(`/api/delivery/${pin}`);
    if (res.status === 429) return null;
    return (await res.json()) as DeliveryResult;
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => undefined;
const VALID_PIN = /^[1-9]\d{5}$/;

function readSavedPincode(): string {
  try {
    return localStorage.getItem(PINCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

function place(r: { city: string | null; state: string | null }, pin: string) {
  return [r.city, r.state].filter(Boolean).join(", ") || pin;
}

/**
 * The delivery line on the product page, with a pincode checker: "Delivers to
 * Pune, Maharashtra between Mon, 16 Nov and Wed, 18 Nov. Cash on Delivery
 * available." Until a pincode is checked it shows the general estimate.
 */
export function DeliveryCheck() {
  const today = useSyncExternalStore(
    noopSubscribe,
    () => indiaDateKey(new Date()),
    () => null,
  );
  // A pincode checked before (here or at checkout), read after hydration.
  const saved = useSyncExternalStore(noopSubscribe, readSavedPincode, () => "");
  const [typed, setTyped] = useState<string | null>(null);
  const pin = typed ?? saved;
  const [checked, setChecked] = useState<{ pin: string; result: DeliveryResult } | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(true);

  const show = useCallback((value: string, result: DeliveryResult) => {
    setChecked({ pin: value, result });
    setEditing(false);
    try {
      if (result.ok) localStorage.setItem(PINCODE_KEY, value);
    } catch {}
  }, []);

  async function check(value: string) {
    if (!VALID_PIN.test(value)) return;
    setLoading(true);
    const result = await fetchDelivery(value);
    setLoading(false);
    if (result) show(value, result);
  }

  // Check the remembered pincode once, on arrival.
  useEffect(() => {
    if (!VALID_PIN.test(saved)) return;
    let cancelled = false;
    void fetchDelivery(saved).then((result) => {
      if (!cancelled && result) show(saved, result);
    });
    return () => {
      cancelled = true;
    };
  }, [saved, show]);

  const r = checked?.result;
  const { dispatch } = siteConfig.shipping;
  let line: ReactNode = <DeliveryEstimate />;
  let tone: "ok" | "no" | null = null;

  if (r && checked) {
    if (!r.ok) {
      tone = "no";
      line = (
        <>
          We couldn&apos;t find pincode <strong>{checked.pin}</strong>. Please check it and try again.
        </>
      );
    } else if (r.serviceable === false) {
      const wa = whatsappLink(`Hi, can you deliver to pincode ${checked.pin}?`);
      tone = "no";
      line = (
        <>
          Sorry, our couriers don&apos;t reach <strong>{place(r, checked.pin)}</strong> yet.{" "}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
              Ask us on WhatsApp
            </a>
          )}
        </>
      );
    } else {
      const range = r.courierDays ? courierDeliveryRange(r.courierDays) : siteConfig.shipping.deliveryDays;
      const when =
        today !== null ? (
          (() => {
            const { from, to } = deliveryWindow(today, range);
            return (
              <>
                between{" "}
                <strong>
                  {formatDeliveryDate(from)} and {formatDeliveryDate(to)}
                </strong>
              </>
            );
          })()
        ) : (
          <>
            in {range.min}–{range.max} working days
          </>
        );
      tone = "ok";
      line = (
        <>
          <strong>Free delivery</strong> to <strong>{place(r, checked.pin)}</strong> {when}. Dispatched within{" "}
          {dispatch}.
          {r.cod === false ? (
            <> Cash on Delivery isn&apos;t available here, so please pay online.</>
          ) : r.cod ? (
            <> Cash on Delivery available.</>
          ) : null}
        </>
      );
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <p className="flex items-start gap-1.5">
        {tone === "ok" && <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />}
        {tone === "no" && <CircleX className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />}
        <span aria-live="polite">{line}</span>
      </p>
      {editing ? (
        <form
          className="mt-2.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void check(pin);
          }}
        >
          <label htmlFor="delivery-pincode" className="sr-only">
            Your pincode
          </label>
          <span className="relative min-w-0 flex-1">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              id="delivery-pincode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="Enter pincode"
              value={pin}
              onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-10 w-full rounded-full border border-line bg-white pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </span>
          <button
            type="submit"
            disabled={loading || !VALID_PIN.test(pin)}
            className={buttonClasses("outline", "sm", "h-10 shrink-0")}
          >
            {loading ? "Checking…" : "Check"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 text-sm font-semibold text-brand hover:underline"
        >
          Change pincode ({checked?.pin})
        </button>
      )}
    </div>
  );
}
