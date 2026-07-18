import { createAnonAuthClient } from "@/shared/lib/supabase/bearer";
import { CORS_HEADERS, jsonResponse } from "@/features/mcp/api/http";

/**
 * OAuth 2.0 token endpoint, backed by Supabase Auth.
 *
 * Two grants: `password` (email + password -> tokens) and `refresh_token`
 * (a durable refresh token -> a fresh access token). It is a thin, standard
 * shell over GoTrue so that an OAuth-capable MCP client can obtain and refresh
 * credentials on its own; it holds no secret of its own and can only mint a
 * token for someone who already proved who they are.
 *
 * Access tokens are short-lived (the project's jwt_expiry, one hour by
 * default). Clients that support refresh use the refresh_token to stay signed
 * in; a client that only pastes a bearer re-fetches from /account/mcp when it
 * expires.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function oauthError(error: string, description: string, status = 400): Response {
  return jsonResponse({ error, error_description: description }, { status });
}

/** Reads grant fields from either a form post or a JSON body. */
async function readParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]));
  }
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

function tokenResponse(session: { access_token: string; refresh_token: string; expires_in: number }): Response {
  // no-store, per RFC 6749 §5.1 -- tokens must not be cached.
  return jsonResponse(
    {
      access_token: session.access_token,
      token_type: "Bearer",
      expires_in: session.expires_in,
      refresh_token: session.refresh_token,
      scope: "mcp",
    },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  let params: Record<string, string>;
  try {
    params = await readParams(request);
  } catch {
    return oauthError("invalid_request", "Body must be form-encoded or JSON.");
  }

  const supabase = createAnonAuthClient();
  const grantType = params.grant_type;

  if (grantType === "password") {
    const email = (params.username || params.email || "").trim();
    const password = params.password || "";
    if (!email || !password) {
      return oauthError("invalid_request", "`username` and `password` are required for the password grant.");
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return oauthError("invalid_grant", error?.message ?? "Invalid email or password.");
    }
    return tokenResponse(data.session);
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.refresh_token;
    if (!refreshToken) {
      return oauthError("invalid_request", "`refresh_token` is required for the refresh_token grant.");
    }
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      return oauthError("invalid_grant", error?.message ?? "The refresh token is invalid or expired.");
    }
    return tokenResponse(data.session);
  }

  return oauthError("unsupported_grant_type", "Supported grants: password, refresh_token.");
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
