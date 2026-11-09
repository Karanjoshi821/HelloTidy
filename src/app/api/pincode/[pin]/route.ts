import { isValidPincode } from "@/lib/india";
import { lookupPincode } from "@/lib/pincode";
import { rateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request";

/** City/state autofill for checkout. Proxied so the browser never calls a third party directly. */
export async function GET(_request: Request, { params }: RouteContext<"/api/pincode/[pin]">) {
  const { pin } = await params;
  if (!isValidPincode(pin)) return Response.json({ ok: false }, { status: 400 });

  const ctx = await getRequestContext();
  const limit = await rateLimit(`pincode:${ctx.ipHash}`, 30, 60);
  if (!limit.ok) {
    return Response.json({ ok: false }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const result = await lookupPincode(pin);
  return Response.json(result, {
    headers: { "Cache-Control": result.ok ? "private, max-age=86400" : "no-store" },
  });
}
