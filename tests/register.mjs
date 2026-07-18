/**
 * Registers the `@/*` alias resolution hook. Loaded via `node --import` so the
 * hook is active before the test module graph resolves.
 */
import { register } from "node:module";

register("./alias-hook.mjs", import.meta.url);
