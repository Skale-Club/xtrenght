import type { Tool } from "@/features/mcp/api/tools/types";
import { catalogueTools } from "@/features/mcp/api/tools/catalogue";
import { workoutTools } from "@/features/mcp/api/tools/workouts";
import { programTools } from "@/features/mcp/api/tools/programs";
import { authoringTools } from "@/features/mcp/api/tools/authoring";

/**
 * The full tool registry, in the order tools should be presented.
 *
 * Read the catalogue, log a workout, follow a program, then -- for admins --
 * author one. Authorization is not expressed by which tools are listed: every
 * tool is advertised to every caller, and the database refuses the ones a given
 * account may not perform. Hiding admin tools from a non-admin would be a
 * cosmetic second gate in front of the real one.
 */
export const tools: Tool[] = [
  ...catalogueTools,
  ...workoutTools,
  ...programTools,
  ...authoringTools,
];

const byName = new Map(tools.map((tool) => [tool.name, tool]));

export function getTool(name: string): Tool | undefined {
  return byName.get(name);
}
