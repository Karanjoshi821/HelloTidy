import "server-only";
import { matchState } from "../india";
import { lookupPincode } from "../pincode";
import { checkServiceability } from "./shiprocket";

/**
 * What a shopper learns from typing their pincode.
 * `serviceable` and `cod` are null when Shiprocket couldn't be asked (not set
 * up, or no answer): the page then shows the usual estimate, never a "no".
 */
export type DeliveryCheck =
  | { ok: false }
  | {
      ok: true;
      serviceable: boolean | null;
      cod: boolean | null;
      courierDays: number | null;
      city: string | null;
      state: string | null;
    };

export async function checkDelivery(pin: string): Promise<DeliveryCheck> {
  const [courier, post] = await Promise.all([checkServiceability(pin), lookupPincode(pin)]);
  // India Post knows every real pincode; Shiprocket only those its couriers serve.
  const city = (post.ok ? post.city : null) ?? courier?.city ?? null;
  // Courier data spells states its own way ("ANDAMAN AND NICOBAR"); use our names.
  const state = (post.ok ? post.state : null) ?? matchState(courier?.state) ?? null;
  if (!courier) return post.ok ? { ok: true, serviceable: null, cod: null, courierDays: null, city, state } : { ok: false };
  if (!courier.serviceable && !post.ok) return { ok: false };
  return { ok: true, serviceable: courier.serviceable, cod: courier.cod, courierDays: courier.days, city, state };
}
