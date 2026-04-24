/**
 * rpiv-subagent-widget — internal Pi extension under rpiv-pi.
 *
 * Subscribes to tool_execution_* events for toolName === "subagent",
 * tracks state via the RunTracker, and renders an aboveEditor tree
 * under key "rpiv-subagents". Also owns the nicobailon registration
 * via a proxy-wrap (renderer-override.ts) so we can quiet the inline
 * tool-result card during streaming (our overlay is the live view).
 *
 * Discovery: auto-loaded via pi.extensions: ["./extensions"] directory
 * scan at packages/rpiv-pi/package.json. No siblings.ts entry
 * (internal extension; SIBLINGS is external-npm-only).
 *
 * Gating: tracker subscription runs unconditionally (precedent 66e9c40 —
 * non-interactive sessions still see tool_execution_* for diagnostics).
 * Only widget.update() is gated behind ctx.hasUI.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerSubagentsWithQuietRenderer } from "./renderer-override.js";
import * as tracker from "./run-tracker.js";
import type { SubagentDetails } from "./types.js";
import { SubagentWidget } from "./widget.js";

const SUBAGENT_TOOL = "subagent";

export default async function (pi: ExtensionAPI) {
	// Register pi-subagents through our proxy so the "subagent" tool's
	// renderResult is swapped for a quiet one. Must run before any of
	// our own tool_execution_* handlers so the tool exists before the
	// first event fires. Settings coordination (strip "npm:pi-subagents"
	// from packages[]) is handled by rpiv-core/claim-pi-subagents.ts.
	await registerSubagentsWithQuietRenderer(pi);

	let widget: SubagentWidget | undefined;

	pi.on("session_start", async (_event, ctx) => {
		tracker.__resetState();
		if (ctx.hasUI) {
			widget ??= new SubagentWidget();
			widget.setUICtx(ctx.ui);
			widget.update();
		}
	});

	pi.on("session_shutdown", async () => {
		widget?.dispose();
		widget = undefined;
		tracker.__resetState();
	});

	// User-turn boundary: advance linger ages on user input, NOT on "turn_start".
	// Pi fires turn_start per agent-loop iteration (after each tool result,
	// before the next assistant call), which would evict completed runs
	// before the user sees them. "input" fires only on user-originated
	// messages — the correct semantics for "persists until next user turn".
	pi.on("input", async () => {
		const evicted = tracker.onTurnStart();
		if (evicted) widget?.update();
	});

	// Background dispatches (args.async === true per pi-subagents@0.17.5 schema)
	// return a job handle in ~100ms. Tracking them produces a misleading
	// instant ✓ since the real work runs detached. pi-subagents' own
	// "subagent-async" widget is the authoritative live viewer for those —
	// we skip and let it handle the display.
	const isAsyncDispatch = (args: unknown): boolean =>
		typeof args === "object" && args !== null && (args as { async?: unknown }).async === true;

	pi.on("tool_execution_start", async (event, ctx) => {
		if (event.toolName !== SUBAGENT_TOOL) return;
		if (isAsyncDispatch(event.args)) return;
		tracker.onStart(event.toolCallId, event.args);
		if (ctx.hasUI) {
			widget ??= new SubagentWidget();
			widget.setUICtx(ctx.ui);
			widget.update();
		}
	});

	// Per-event re-render on tool_execution_update would fire once per
	// streamed partial-result frame, compounding with the spinner ticker
	// and Pi's main-stream spinner to produce terminal redraw races that
	// visibly clip neighbouring above-editor widgets. Mutating tracker
	// state in place is enough — the spinner tick picks up the fresh
	// run.results on its next cycle (≤ TICK_MS ms later).
	pi.on("tool_execution_update", async (event, _ctx) => {
		if (event.toolName !== SUBAGENT_TOOL) return;
		if (isAsyncDispatch(event.args)) return;
		const details = (event.partialResult as { details?: SubagentDetails } | undefined)?.details;
		tracker.onUpdate(event.toolCallId, details);
	});

	// tool_execution_end has no args — if onStart was skipped as async,
	// tracker.onEnd is a no-op (runs.get returns undefined) and the
	// subsequent widget.update() harmlessly re-renders existing state.
	pi.on("tool_execution_end", async (event, ctx) => {
		if (event.toolName !== SUBAGENT_TOOL) return;
		tracker.onEnd(event.toolCallId, event.result, event.isError);
		if (ctx.hasUI) widget?.update();
	});
}
