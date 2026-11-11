import { isValidPincode } from "@/lib/india";
import { rateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request";
import { checkDelivery } from "@/lib/shipping/delivery-check";

/**
 * "Do you deliver to my pincode?" for the product page and checkout. Proxied
 * so the Shiprocket login never reaches the browser; courier rates are our
 * cost and are never returned.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/delivery/[pin]">) {
  const { pin } = await params;
  if (!isValidPincode(pin)) return Response.json({ ok: false }, { status: 400 });

  const ctx = await getRequestContext();
  const limit = await rateLimit(`delivery:${ctx.ipHash}`, 20, 60);
  if (!limit.ok) {
    return Response.json({ ok: false }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const result = await checkDelivery(pin);
  const definite = result.ok && result.serviceable !== null;
  return Response.json(result, {
    headers: { "Cache-Control": definite ? "private, max-age=3600" : "no-store" },
  });
}
