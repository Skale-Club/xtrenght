import { authenticate } from "@/features/mcp/api/auth";
import { handleMessage } from "@/features/mcp/api/server";
import { CORS_HEADERS, jsonResponse, unauthorized } from "@/features/mcp/api/http";
import {
  ErrorCode,
  failure,
  isJsonRpcRequest,
  type JsonRpcRequest,
} from "@/features/mcp/api/protocol";
import type { ToolContext } from "@/features/mcp/api/tools/types";

/**
 * The Model Context Protocol endpoint (Streamable HTTP, stateless).
 *
 * A client POSTs a JSON-RPC message; this authenticates the bearer token, runs
 * the requested method with an RLS-scoped Supabase client, and answers with a
 * single JSON response. There is no long-lived SSE stream and no server session
 * to track -- each request stands alone, which is what makes it safe on a
 * serverless route.
 */

// supabase-js and the JWT check want the Node runtime, not the edge.
export const runtime = "nodejs";
// Never cache: every call is authenticated and side-effecting.
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(failure(null, ErrorCode.ParseError, "Request body is not valid JSON."), { status: 400 });
  }

  const auth = await authenticate(request.headers.get("authorization"));
  if (!auth.ok) {
    return unauthorized(request, auth.error);
  }

  const ctx: ToolContext = { supabase: auth.supabase, user: auth.user };

  // JSON-RPC permits a batch (an array). 2025-06-18 drops it, but handling one
  // gracefully costs nothing and keeps older clients working.
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length === 0) {
    return jsonResponse(failure(null, ErrorCode.InvalidRequest, "Empty batch."), { status: 400 });
  }

  const responses = [];
  for (const message of messages) {
    if (!isJsonRpcRequest(message)) {
      responses.push(failure(null, ErrorCode.InvalidRequest, "Not a valid JSON-RPC 2.0 message."));
      continue;
    }
    const response = await handleMessage(message as JsonRpcRequest, ctx);
    if (response !== null) responses.push(response);
  }

  // All-notification batches expect no body; 202 Accepted is the right answer.
  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const payload = Array.isArray(body) ? responses : responses[0];
  return jsonResponse(payload);
}

/**
 * This transport does not open a server-to-client SSE stream, so a bare GET has
 * nothing to return. 405 with Allow is the spec's answer for that.
 */
export async function GET(): Promise<Response> {
  return jsonResponse(failure(null, ErrorCode.InvalidRequest, "This MCP endpoint only accepts POST."), {
    status: 405,
    headers: { Allow: "POST, OPTIONS" },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
