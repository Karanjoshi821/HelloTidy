import { z } from "zod";
import { authorizeRecovery, json, readJson } from "@/lib/recovery/api";
import { issueRecoveryCoupon, RecoveryError } from "@/lib/recovery/service";

const bodySchema = z.object({ percent: z.number().min(1).max(90) });

/**
 * Issues the customer's one-time discount code during the call. The percent is
 * capped at RECOVERY_MAX_DISCOUNT_PERCENT; asking twice returns the same code.
 * POST /api/recovery/leads/<id>/coupon  {"percent": 10}
 */
export async function POST(request: Request, { params }: RouteContext<"/api/recovery/leads/[id]/coupon">) {
  const auth = authorizeRecovery(request);
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: 'Send {"percent": <number>}.' }, 400);
  const { id } = await params;
  try {
    return json(await issueRecoveryCoupon(id, parsed.data.percent, auth.cfg));
  } catch (error) {
    if (error instanceof RecoveryError) return json({ error: error.message }, error.status);
    throw error;
  }
}
