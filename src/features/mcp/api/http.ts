import { PROTOCOL_VERSION } from "@/features/mcp/api/protocol";

/**
 * HTTP concerns shared by the MCP route and its discovery endpoints: CORS, the
 * bearer challenge, and where the OAuth metadata lives.
 */

export const MCP_PATH = "/api/mcp";
export const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";
export const TOKEN_PATH = "/api/mcp/token";

/** The public origin, honouring a proxy's forwarded host so links are correct behind one. */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const host = forwardedHost ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

/**
 * A 401 that tells a spec-aware MCP client where to authenticate. The
 * `resource_metadata` pointer is what lets it discover the token endpoint and
 * begin an OAuth flow rather than simply failing.
 */
export function unauthorized(request: Request, message: string): Response {
  const metadata = `${originOf(request)}${PROTECTED_RESOURCE_METADATA_PATH}`;
  return jsonResponse(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message } },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${metadata}", error="invalid_token", error_description="${message}"`,
      },
    },
  );
}
