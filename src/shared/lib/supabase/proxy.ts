import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/shared/types/database.types";

/**
 * Prefixes reachable while signed out. Everything else demands a session.
 *
 * /reset-password is deliberately absent: the recovery link goes to /auth/confirm,
 * which exchanges the token for a session before redirecting there. Landing on it
 * without one means the link was never followed, and /login is the right answer.
 */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/auth",
  "/exercises",
  "/programs",
  // Cached by the service worker at install time and served straight from
  // Cache Storage while offline -- must render the same whether or not
  // there's a session.
  "/offline",
];

/**
 * Prefixes that authenticate themselves and must answer rather than redirect.
 *
 * The MCP endpoint and its OAuth discovery documents carry a bearer token, not
 * a session cookie. A signed-out request to them is answered with a 401 (or the
 * public metadata), never bounced to /login -- an API client cannot follow an
 * HTML redirect, and a login page is not a valid JSON-RPC reply.
 */
const SELF_AUTHENTICATED_PREFIXES = ["/api/mcp", "/.well-known/oauth-"];

function isPublicRoute(pathname: string) {
  if (SELF_AUTHENTICATED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Refreshes the auth session and gates private routes.
 *
 * Access tokens are short-lived, so something must exchange the refresh token
 * and hand the new pair back to the browser. Server Components cannot write
 * cookies -- this is the one place in the request lifecycle that can.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          // no-store et al. A cached response carrying a Set-Cookie for auth
          // would hand one user's session to the next visitor.
          Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
        },
      },
    },
  );

  // Nothing may run between createServerClient and getUser(). getUser()
  // revalidates the token against Supabase; getSession() only decodes the
  // cookie and is therefore not trustworthy on the server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicRoute(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Return this exact object. Building a fresh NextResponse here would drop the
  // refreshed cookies and log the user out at random.
  return supabaseResponse;
}
