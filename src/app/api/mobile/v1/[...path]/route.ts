import { dispatch, type Method, type Route } from "@/lib/mobile/router";
import { accountRoutes } from "@/lib/mobile/routes/account";
import { orderRoutes } from "@/lib/mobile/routes/orders";
import { storeRoutes } from "@/lib/mobile/routes/store";

/**
 * JSON API for the DulyPaid admin app (Android). Authorization: Bearer <token>
 * from POST /api/mobile/v1/auth/login. Reads use the same lib/* functions as
 * the web admin pages; writes run the same Server Actions. See src/lib/mobile.
 */
const routes: Route[] = [...accountRoutes, ...orderRoutes, ...storeRoutes];

function handle(method: Method) {
  return async (request: Request, { params }: RouteContext<"/api/mobile/v1/[...path]">) => {
    const { path } = await params;
    return dispatch(routes, method, path, request);
  };
}

export const GET = handle("GET");
export const POST = handle("POST");
export const PATCH = handle("PATCH");
export const DELETE = handle("DELETE");
