import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic admin gate: bounces visitors without a session cookie to the
 * login page. This is a UX shortcut only — every admin page, server action and
 * route handler verifies the session against the database itself.
 */
const SESSION_COOKIES = ["__Host-hellotidy_admin", "hellotidy_admin"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (!hasSession) {
    const url = new URL("/admin/login", request.url);
    if (pathname !== "/admin") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
