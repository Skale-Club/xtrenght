/**
 * MCP server tests.
 *
 *   pnpm test:mcp
 *
 * Exercises the JSON-RPC dispatcher, the tool registry and the input validator
 * directly -- the real modules, loaded through the alias hook. Database access
 * is faked: these tests cover protocol framing, tool advertisement and input
 * validation, none of which touch Postgres. Authorization itself lives in RLS
 * and is covered by pnpm test:db.
 */
import { handleMessage } from "@/features/mcp/api/server.ts";
import { tools, getTool } from "@/features/mcp/api/tools/index.ts";
import { validateInput } from "@/features/mcp/api/validation.ts";

let failures = 0;
const ok = (name) => console.log(`  PASS  ${name}`);
const fail = (name, detail) => {
  failures++;
  console.log(`  FAIL  ${name}`);
  if (detail) console.log(`        ${detail}`);
};
const expect = (name, actual, expected) =>
  actual === expected ? ok(name) : fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const truthy = (name, actual, detail) => (actual ? ok(name) : fail(name, detail));

/** A chainable stand-in for the Supabase client; every method returns itself. */
function fakeSupabase(byTable) {
  const from = (table) => {
    const result = () => byTable[table] ?? { data: null, error: null };
    const builder = new Proxy(
      {
        maybeSingle: () => Promise.resolve(result()),
        single: () => Promise.resolve(result()),
        then: (res, rej) => Promise.resolve(result()).then(res, rej),
      },
      { get: (target, prop) => (prop in target ? target[prop] : () => builder) },
    );
    return builder;
  };
  return { from };
}

const ctx = (supabase, user = { id: "u1", email: "ada@test.com" }) => ({ supabase, user });
const call = (method, params, id = 1) => handleMessage({ jsonrpc: "2.0", id, method, params }, ctx(fakeSupabase({})));

console.log("protocol:");

{
  const res = await call("initialize", { protocolVersion: "2025-06-18" });
  expect("initialize echoes a supported protocol version", res.result.protocolVersion, "2025-06-18");
  expect("initialize reports the server name", res.result.serverInfo.name, "xtrenght-mcp");
  truthy("initialize advertises tools capability", res.result.capabilities?.tools, "no tools capability");
}

{
  const res = await call("initialize", { protocolVersion: "1999-01-01" });
  truthy("initialize falls back for an unknown protocol version", res.result.protocolVersion !== "1999-01-01");
}

{
  const res = await call("ping", {});
  expect("ping returns an empty result", JSON.stringify(res.result), "{}");
}

{
  const res = await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx(fakeSupabase({})));
  expect("a notification gets no reply", res, null);
}

{
  const res = await call("does/not/exist", {});
  expect("unknown method is MethodNotFound", res.error?.code, -32601);
}

console.log("\ntool registry:");

{
  const res = await call("tools/list", {});
  const names = res.result.tools.map((t) => t.name);
  truthy("tools/list returns the whole registry", names.length === tools.length, `${names.length} vs ${tools.length}`);
  expect("tool names are unique", new Set(names).size, names.length);

  const shapeProblem = res.result.tools.find(
    (t) => t.inputSchema?.type !== "object" || t.inputSchema?.additionalProperties !== false || !t.description,
  );
  truthy("every tool has an object schema, no extra props, and a description", !shapeProblem, JSON.stringify(shapeProblem?.name));

  for (const key of ["whoami", "create_program", "start_workout", "add_set", "get_program"]) {
    truthy(`registry contains ${key}`, !!getTool(key));
  }
}

console.log("\ntools/call:");

{
  const res = await handleMessage(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "nope", arguments: {} } },
    ctx(fakeSupabase({})),
  );
  expect("calling an unknown tool is InvalidParams", res.error?.code, -32602);
}

{
  // Missing the required sessionExerciseId -> a tool-level error, not a crash.
  const res = await handleMessage(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "add_set", arguments: {} } },
    ctx(fakeSupabase({})),
  );
  truthy("missing a required argument returns isError", res.result?.isError === true, JSON.stringify(res));
}

{
  const supabase = fakeSupabase({ profiles: { data: { display_name: "Ada", role: "admin" }, error: null } });
  const res = await handleMessage(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "whoami", arguments: {} } },
    ctx(supabase),
  );
  expect("whoami reports the role from the profile", res.result.structuredContent.role, "admin");
  expect("whoami derives isAdmin", res.result.structuredContent.isAdmin, true);
  truthy("whoami emits a text content block", res.result.content?.[0]?.type === "text");
}

{
  const supabase = fakeSupabase({
    exercises: { data: [{ id: "e1", name: "Bench Press", slug: "bench-press" }], count: 1, error: null },
  });
  const res = await handleMessage(
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "list_exercises", arguments: { search: "bench" } } },
    ctx(supabase),
  );
  expect("list_exercises returns the row count", res.result.structuredContent.total, 1);
  expect("list_exercises paginates", res.result.structuredContent.pageCount, 1);
}

console.log("\nvalidation:");

{
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1 },
      level: { type: "string", enum: ["A", "B"] },
      count: { type: "integer", minimum: 1, maximum: 3 },
      page: { type: "integer", default: 7 },
    },
  };

  expect("required field is enforced", validateInput(schema, {}).ok, false);
  expect("enum value is enforced", validateInput(schema, { name: "x", level: "Z" }).ok, false);
  expect("integer bound is enforced", validateInput(schema, { name: "x", count: 9 }).ok, false);
  expect("unknown field is rejected", validateInput(schema, { name: "x", extra: 1 }).ok, false);
  expect("non-integer is rejected", validateInput(schema, { name: "x", count: 1.5 }).ok, false);

  const good = validateInput(schema, { name: "x", level: "A", count: 2 });
  expect("a valid input passes", good.ok, true);
  expect("defaults are applied", good.ok && good.value.page, 7);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
