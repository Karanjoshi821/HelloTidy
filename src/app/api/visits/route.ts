import { recordVisit } from "@/lib/visitors/service";

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Our own visitor tracking (src/lib/visitors). Takes JSON, or text/plain from
 * navigator.sendBeacon when a tab closes. Always answers 204: it never says
 * what was recorded, and a failure must never surface in the store.
 */
export async function POST(request: Request): Promise<Response> {
  const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  // Browsers send Origin on POST; another site's page can't post visits for us.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && originHost(origin) !== host) return done;

  const body = await request.text().catch(() => "");
  if (!body || body.length > 8_000) return done;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return done;
  }
  try {
    await recordVisit(raw);
  } catch (error) {
    console.error("[visitors] record failed:", error);
  }
  return done;
}
