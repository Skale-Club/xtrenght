import {
  ErrorCode,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  failure,
  success,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@/features/mcp/api/protocol";
import { validateInput } from "@/features/mcp/api/validation";
import { getTool, tools } from "@/features/mcp/api/tools";
import { ToolError, type ToolContext } from "@/features/mcp/api/tools/types";

/**
 * Dispatches one JSON-RPC message to the right MCP method.
 *
 * Returns a response for requests and null for notifications (which, by the
 * JSON-RPC contract, carry no id and get no reply). Everything a tool needs to
 * touch the database arrives in `ctx`, already scoped to the caller.
 */

const SERVER_INFO = { name: "xtrenght-mcp", title: "Xtrenght", version: "0.1.0" };

const INSTRUCTIONS =
  "Xtrenght is a workout tracker. Use these tools to browse the exercise " +
  "catalogue, build and log workouts (start a session, add exercises and sets, " +
  "finish and rate it), follow training programs, and -- for admin accounts -- " +
  "author programs. Start with `whoami` to confirm the connection and whether " +
  "the account has admin rights. All data access is scoped to the signed-in " +
  "user by the database.";

function toolDescriptor(name: string) {
  const tool = getTool(name)!;
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations ?? {},
  };
}

async function callTool(request: JsonRpcRequest, ctx: ToolContext): Promise<JsonRpcResponse> {
  const id = request.id ?? null;
  const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };

  if (typeof params.name !== "string") {
    return failure(id, ErrorCode.InvalidParams, "tools/call requires a string `name`.");
  }

  const tool = getTool(params.name);
  if (!tool) {
    return failure(id, ErrorCode.InvalidParams, `Unknown tool: ${params.name}`);
  }

  const validated = validateInput(tool.inputSchema, params.arguments ?? {});
  if (!validated.ok) {
    // An input-shape problem is reported as a tool error, not a protocol error,
    // so the model sees the message and can correct the call.
    return success(id, { content: [{ type: "text", text: `Invalid arguments: ${validated.error}` }], isError: true });
  }

  try {
    const result = await tool.handler(validated.value, ctx);
    const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    const payload: Record<string, unknown> = { content: [{ type: "text", text }] };
    // structuredContent must be an object; include it for object results only.
    if (result !== null && typeof result === "object" && !Array.isArray(result)) {
      payload.structuredContent = result;
    }
    return success(id, payload);
  } catch (error) {
    if (error instanceof ToolError) {
      return success(id, { content: [{ type: "text", text: error.message }], isError: true });
    }
    // An unexpected throw is a server fault, not a tool-level failure.
    const message = error instanceof Error ? error.message : "Unknown error";
    return failure(id, ErrorCode.InternalError, `Tool "${tool.name}" failed: ${message}`);
  }
}

/**
 * Handles a single request or notification, returning the reply (or null for a
 * notification). `ctx` is the authenticated, RLS-scoped context; initialize,
 * ping and tools/list ignore it, only tools/call reaches the database through
 * it.
 */
export async function handleMessage(
  request: JsonRpcRequest,
  ctx: ToolContext,
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;

  switch (request.method) {
    case "initialize": {
      const requested = (request.params?.protocolVersion as string) ?? PROTOCOL_VERSION;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSION;
      return success(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }

    // Lifecycle notifications: acknowledged by silence.
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return success(id, {});

    case "tools/list":
      return success(id, { tools: tools.map((tool) => toolDescriptor(tool.name)) });

    case "tools/call":
      return callTool(request, ctx);

    default:
      // Notifications get no reply even when unrecognised.
      if (request.id === undefined) return null;
      return failure(id, ErrorCode.MethodNotFound, `Method not found: ${request.method}`);
  }
}
