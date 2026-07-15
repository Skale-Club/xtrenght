/**
 * The slice of JSON-RPC 2.0 the Model Context Protocol speaks.
 *
 * The MCP "Streamable HTTP" transport frames every message as JSON-RPC 2.0.
 * This server is stateless: it answers each POST with a single JSON response
 * rather than holding an SSE stream open, which is a valid transport mode and
 * the one that fits a serverless route handler. So these helpers only cover
 * request/response framing -- there are no server-initiated messages to model.
 */

export const JSONRPC_VERSION = "2.0";

/** The protocol revision this server implements. */
export const PROTOCOL_VERSION = "2025-06-18";

/** Protocol revisions a client may ask for and still be understood. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: typeof JSONRPC_VERSION;
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcSuccess = {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcError = {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// The standard JSON-RPC error codes, plus the range MCP reserves for its own.
export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export function success(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function failure(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return { jsonrpc: JSONRPC_VERSION, id, error: data === undefined ? { code, message } : { code, message, data } };
}

/** A notification carries no id and expects no reply. */
export function isNotification(message: JsonRpcRequest): boolean {
  return message.id === undefined;
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { jsonrpc?: unknown }).jsonrpc === JSONRPC_VERSION &&
    typeof (value as { method?: unknown }).method === "string"
  );
}
