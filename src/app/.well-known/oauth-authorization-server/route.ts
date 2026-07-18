import { CORS_HEADERS, TOKEN_PATH, jsonResponse, originOf } from "@/features/mcp/api/http";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * This server issues tokens through a Supabase-backed token endpoint using the
 * password and refresh-token grants -- there is no browser redirect flow, so no
 * authorization_endpoint is advertised. A client that needs the redirect flow
 * falls back to a token pasted from /account/mcp, which is the documented path.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const origin = originOf(request);
  return jsonResponse({
    issuer: origin,
    token_endpoint: `${origin}${TOKEN_PATH}`,
    grant_types_supported: ["password", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    response_types_supported: [],
    scopes_supported: ["mcp"],
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
