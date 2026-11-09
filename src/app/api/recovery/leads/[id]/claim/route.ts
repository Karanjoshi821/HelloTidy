import { authorizeRecovery, json } from "@/lib/recovery/api";
import { claimLeadForCall } from "@/lib/recovery/service";

/**
 * The voice agent claims a lead right before dialling. Counts the attempt only
 * when the lead may be called; otherwise answers with `eligible: false` and a reason.
 * POST /api/recovery/leads/<id>/claim
 */
export async function POST(request: Request, { params }: RouteContext<"/api/recovery/leads/[id]/claim">) {
  const auth = authorizeRecovery(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const lead = await claimLeadForCall(id, auth.cfg);
  return lead ? json(lead) : json({ error: "not found" }, 404);
}
