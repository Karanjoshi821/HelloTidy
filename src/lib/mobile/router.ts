import "server-only";
import { requireMobileUser, type MobileAuth } from "./auth";
import { errorResponse, json, notFound, readJson } from "./http";

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** public: no session · user: any signed-in admin · owner: owners only · setup: allowed on a one-time password. */
export type Access = "public" | "user" | "owner" | "setup";

export type RouteContext = {
  request: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  /** null only on public routes. */
  auth: MobileAuth;
};

export type Route = {
  method: Method;
  /** e.g. "orders/:id/status" */
  path: string;
  access: Access;
  handler: (ctx: RouteContext) => Promise<unknown>;
};

function match(pattern: string, segments: string[]): Record<string, string> | null {
  const parts = pattern.split("/");
  if (parts.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(":")) {
      const value = decodeURIComponent(segments[i]);
      if (!value || value.length > 200) return null;
      params[parts[i].slice(1)] = value;
    } else if (parts[i] !== segments[i]) return null;
  }
  return params;
}

export async function dispatch(routes: Route[], method: Method, segments: string[], request: Request): Promise<Response> {
  try {
    let found: { route: Route; params: Record<string, string> } | null = null;
    let pathExists = false;
    for (const route of routes) {
      const params = match(route.path, segments);
      if (!params) continue;
      pathExists = true;
      if (route.method === method) {
        found = { route, params };
        break;
      }
    }
    if (!found) {
      return pathExists
        ? json({ error: { code: "not_found", message: "Method not allowed." } }, 405)
        : errorResponse(notFound("That endpoint"));
    }
    const { route, params } = found;
    const auth =
      route.access === "public"
        ? (null as unknown as MobileAuth)
        : await requireMobileUser({ owner: route.access === "owner", allowPasswordSetup: route.access === "setup" });
    const body = method === "GET" ? {} : await readJson(request);
    const data = await route.handler({ request, params, query: new URL(request.url).searchParams, body, auth });
    return json(data ?? { ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
