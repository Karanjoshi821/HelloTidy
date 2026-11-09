"use client";

import { useEffect, useRef } from "react";
import { saveCartLeadAction, withdrawCartLeadAction } from "@/app/(site)/checkout/actions";
import { uuid } from "@/lib/client-id";
import { cartLeadSchema } from "@/lib/validation";
import type { CartLine } from "../cart/cart-context";

const STORAGE_KEY = "hellotidy_cart_lead_v1";
/** Wait for the customer to stop typing, so a half-typed number is never saved. */
const SAVE_DELAY_MS = 1500;

function readKey(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && cartLeadSchema.shape.clientKey.safeParse(stored).success) return stored;
    const fresh = uuid();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Storage unavailable (private mode): one key for this visit.
    return uuid();
  }
}

/**
 * Saves the cart for a recovery call while the customer fills in checkout, once
 * they have ticked the call consent and typed a valid name and mobile number.
 * Fire-and-forget: checkout never waits on it or shows its errors.
 */
export function useCartLead({
  enabled,
  consent,
  name,
  phone,
  lines,
}: {
  enabled: boolean;
  consent: boolean;
  name: string;
  phone: string;
  lines: CartLine[];
}): { forget: () => void } {
  const keyRef = useRef<string | null>(null);
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const clientKey = (keyRef.current ??= readKey());
    if (!consent) {
      // Only an untick after a save withdraws anything.
      if (lastSaved.current) {
        lastSaved.current = null;
        void withdrawCartLeadAction(clientKey).catch(() => undefined);
      }
      return;
    }
    const input = { clientKey, name, phone, lines };
    const parsed = cartLeadSchema.safeParse(input);
    if (!parsed.success) return;
    const signature = JSON.stringify(parsed.data);
    if (signature === lastSaved.current) return;

    const timer = setTimeout(() => {
      lastSaved.current = signature;
      void saveCartLeadAction(input).catch(() => {
        lastSaved.current = null;
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, consent, name, phone, lines]);

  return {
    /** After an order: the next cart gets a new lead. */
    forget: () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing stored.
      }
      keyRef.current = null;
      lastSaved.current = null;
    },
  };
}
