/**
 * A module resolution hook that teaches Node the `@/*` path alias from
 * tsconfig, so the MCP test can import the real source files by the same
 * specifiers the app uses.
 *
 * The MCP server, its dispatcher and its tool registry import Supabase only as
 * types, which type-stripping erases -- so these modules load under Node with
 * no live project and no bundler. That is what lets `pnpm test:mcp` exercise
 * the actual code rather than a copy of it.
 */
import { pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const isFile = (path) => existsSync(path) && statSync(path).isFile();

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = join(SRC, specifier.slice(2));
    // Handles both extensionless specifiers (as the source uses) and ones that
    // already name a .ts file (as the test imports do).
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
      if (isFile(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
