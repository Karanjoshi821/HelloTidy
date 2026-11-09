import { authorizeRecovery, json } from "@/lib/recovery/api";
import { getLeadView } from "@/lib/recovery/service";

/**
 * A saved cart and whether it may be called now (n8n checks this after its wait).
 * GET /api/recovery/leads/<id>  ·  Authorization: Bearer <RECOVERY_API_KEY>
 */
export async function GET(request: Request, { params }: RouteContext<"/api/recovery/leads/[id]">) {
  const auth = authorizeRecovery(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const lead = await getLeadView(id, auth.cfg);
  return lead ? json(lead) : json({ error: "not found" }, 404);
}
