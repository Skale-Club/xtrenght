import {
  AUTHORIZATION_SERVER_METADATA_PATH,
  CORS_HEADERS,
  MCP_PATH,
  jsonResponse,
  originOf,
} from "@/features/mcp/api/http";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728).
 *
 * The MCP endpoint's 401 points a client here; this document names the
 * authorization server it should talk to. That indirection is what lets a
 * client discover how to get a token without any of it being hard-coded.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const origin = originOf(request);
  return jsonResponse({
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [`${origin}${AUTHORIZATION_SERVER_METADATA_PATH}`],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/account/mcp`,
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
