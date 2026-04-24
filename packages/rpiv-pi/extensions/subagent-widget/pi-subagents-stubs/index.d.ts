/**
 * Compile-time stub for `pi-subagents` (nicobailon/pi-subagents).
 *
 * Why a stub: nicobailon ships .ts source directly (no main/exports/types
 * in package.json, no .d.ts). With Node16 moduleResolution, tsc would
 * resolve `import "pi-subagents"` straight to `node_modules/pi-subagents/
 * index.ts` and type-check the entire package — which currently has a
 * bunch of upstream type errors that aren't ours to fix.
 *
 * This file is referenced via tsconfig `paths` so tsc uses it at compile
 * time. At runtime, pi's jiti loader resolves the real package under
 * `node_modules/pi-subagents/` normally.
 *
 * Keep the surface narrow — only what we call from renderer-override.ts.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

declare const registerSubagentExtension: (pi: ExtensionAPI) => void | Promise<void>;
export default registerSubagentExtension;
