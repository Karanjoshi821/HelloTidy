import { z } from "zod";
import { authorizeRecovery, json, readJson } from "@/lib/recovery/api";
import { CALL_OUTCOMES, recordCallResult, RecoveryError } from "@/lib/recovery/service";

const bodySchema = z.object({
  outcome: z.enum(CALL_OUTCOMES),
  summary: z.string().max(2000).optional(),
  durationSec: z.number().int().min(0).max(86_400).optional(),
});

/**
 * How a call ended, from the voice agent.
 * POST /api/recovery/leads/<id>/result  {"outcome": "will_order", "summary": "…"}
 */
export async function POST(request: Request, { params }: RouteContext<"/api/recovery/leads/[id]/result">) {
  const auth = authorizeRecovery(request);
  if ("response" in auth) return auth.response;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ error: `outcome must be one of: ${CALL_OUTCOMES.join(", ")}` }, 400);
  const { id } = await params;
  try {
    const lead = await recordCallResult(id, parsed.data, auth.cfg);
    return json({ ok: true, status: lead.status, callAttempts: lead.callAttempts });
  } catch (error) {
    if (error instanceof RecoveryError) return json({ error: error.message }, error.status);
    throw error;
  }
}
