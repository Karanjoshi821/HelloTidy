import { getAdmin } from "@/lib/auth/dal";
import { getLiveVisitors } from "@/lib/visitors/reports";

/** Visits active in the last five minutes, for the live card on Admin → Visitors (owner only). */
export async function GET(): Promise<Response> {
  const user = await getAdmin();
  if (!user || user.mustChangePassword || user.role !== "owner") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const live = await getLiveVisitors();
  return Response.json({ live, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
