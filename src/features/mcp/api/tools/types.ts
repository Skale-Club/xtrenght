import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "@/shared/types/database.types";
import type { JsonSchema } from "@/features/mcp/api/validation";

/**
 * What a tool handler is given: a Supabase client already scoped to the caller
 * (so every query it runs is filtered by RLS), and the authenticated user.
 *
 * There is no `isAdmin` flag here on purpose. Whether the caller may edit a
 * program is not decided by this code -- it is decided by the database when the
 * write runs. A tool that needs admin rights simply attempts the write; for a
 * non-admin Postgres refuses it, and the tool reports that refusal.
 */
export type ToolContext = {
  supabase: SupabaseClient<Database>;
  user: User;
};

/**
 * A user-facing failure. Thrown by a handler, caught by the dispatcher, and
 * returned as an MCP tool result with `isError: true` rather than crashing the
 * whole JSON-RPC call -- the model is expected to read it and react.
 */
export class ToolError extends Error {}

export type Tool = {
  name: string;
  /** Human-readable label shown in tool pickers. */
  title: string;
  description: string;
  inputSchema: JsonSchema;
  /**
   * A read-only tool makes no changes and can be retried freely; a destructive
   * one may remove data. Surfaced as MCP tool annotations so a client can warn
   * before running the dangerous ones.
   */
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

/** Turns a Supabase/PostgREST error into a readable tool failure. */
export function fail(message: string): never {
  throw new ToolError(message);
}
