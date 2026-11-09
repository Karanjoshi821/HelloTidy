import { authorizeRecovery, json } from "@/lib/recovery/api";
import { markCouponSent } from "@/lib/recovery/service";

/**
 * n8n sent the customer their code (e.g. on WhatsApp).
 * POST /api/recovery/leads/<id>/coupon-sent
 */
export async function POST(request: Request, { params }: RouteContext<"/api/recovery/leads/[id]/coupon-sent">) {
  const auth = authorizeRecovery(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  return (await markCouponSent(id)) ? json({ ok: true }) : json({ error: "not found" }, 404);
}
