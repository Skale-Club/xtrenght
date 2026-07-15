/**
 * A tiny validator over the subset of JSON Schema that tool inputs use.
 *
 * The same schema object serves two jobs: it is handed to clients verbatim in
 * `tools/list` so they know how to call a tool, and it is checked here against
 * the arguments that arrive in `tools/call`. Keeping one source of truth means
 * the advertised contract and the enforced contract cannot drift apart.
 *
 * This is deliberately not a general JSON Schema engine -- it covers objects,
 * the primitive types, enums, arrays, a few numeric bounds and defaults, which
 * is everything the tools here express and nothing they don't.
 */

export type JsonSchema = {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: readonly string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  additionalProperties?: boolean;
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function typeName(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function validateNode(schema: JsonSchema, value: unknown, path: string): ValidationResult<unknown> {
  // A default fills in a missing value before any type check runs.
  if (value === undefined && schema.default !== undefined) {
    value = structuredClone(schema.default);
  }

  switch (schema.type) {
    case "object": {
      if (typeName(value) !== "object") {
        return { ok: false, error: `${path || "input"} must be an object` };
      }
      const input = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};

      for (const key of schema.required ?? []) {
        if (input[key] === undefined || input[key] === null) {
          return { ok: false, error: `${path ? `${path}.` : ""}${key} is required` };
        }
      }

      if (schema.additionalProperties === false) {
        for (const key of Object.keys(input)) {
          if (!schema.properties?.[key]) {
            return { ok: false, error: `${path ? `${path}.` : ""}${key} is not a known field` };
          }
        }
      }

      for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
        const child = validateNode(propSchema, input[key], path ? `${path}.${key}` : key);
        if (!child.ok) return child;
        if (child.value !== undefined) out[key] = child.value;
      }
      return { ok: true, value: out };
    }

    case "array": {
      if (value === undefined) return { ok: true, value: undefined };
      if (!Array.isArray(value)) return { ok: false, error: `${path} must be an array` };
      const out: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const child = validateNode(schema.items ?? {}, value[i], `${path}[${i}]`);
        if (!child.ok) return child;
        out.push(child.value);
      }
      return { ok: true, value: out };
    }

    case "string": {
      if (value === undefined) return { ok: true, value: undefined };
      if (typeof value !== "string") return { ok: false, error: `${path} must be a string` };
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return { ok: false, error: `${path} must be at least ${schema.minLength} characters` };
      }
      if (schema.enum && !schema.enum.includes(value)) {
        return { ok: false, error: `${path} must be one of: ${schema.enum.join(", ")}` };
      }
      return { ok: true, value };
    }

    case "integer":
    case "number": {
      if (value === undefined) return { ok: true, value: undefined };
      if (typeof value !== "number" || Number.isNaN(value)) {
        return { ok: false, error: `${path} must be a number` };
      }
      if (schema.type === "integer" && !Number.isInteger(value)) {
        return { ok: false, error: `${path} must be a whole number` };
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        return { ok: false, error: `${path} must be at least ${schema.minimum}` };
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        return { ok: false, error: `${path} must be at most ${schema.maximum}` };
      }
      return { ok: true, value };
    }

    case "boolean": {
      if (value === undefined) return { ok: true, value: undefined };
      if (typeof value !== "boolean") return { ok: false, error: `${path} must be true or false` };
      return { ok: true, value };
    }

    default:
      // No declared type: pass the value through untouched.
      return { ok: true, value };
  }
}

/** Validates and coerces `input` against `schema`, applying defaults. */
export function validateInput<T = Record<string, unknown>>(
  schema: JsonSchema,
  input: unknown,
): ValidationResult<T> {
  const result = validateNode(schema, input ?? {}, "");
  if (!result.ok) return result;
  return { ok: true, value: result.value as T };
}
