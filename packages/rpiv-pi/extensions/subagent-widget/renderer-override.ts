/**
 * Quiet renderResult override for the nicobailon subagent tool.
 *
 * Motivation: pi-coding-agent re-invokes `tool.renderResult` on every
 * `tool_execution_update` while a subagent is streaming. Nicobailon's
 * default renderer produces a multi-line Container (current tool,
 * recent output, recent tools, token line) that re-flows the inline
 * tool-call card on every frame → visible flicker. Our `aboveEditor`
 * overlay (widget.ts) is the authoritative live view; the inline card
 * should be static while running, full at completion.
 *
 * Mechanism: wrap the ExtensionAPI handed to nicobailon's default
 * export in a Proxy that intercepts `registerTool` for the "subagent"
 * tool and swaps its `renderResult` with ours. All other tools +
 * every other ExtensionAPI method pass through unchanged.
 *
 * Deployment: settings.json must not list `"npm:pi-subagents"` — only
 * this wrapper loads nicobailon (via `registerSubagentExtension(pi)`)
 * so every handler/bridge/tracker is registered exactly once. The
 * claimer helper (rpiv-core/claim-pi-subagents.ts) strips that entry
 * idempotently from `~/.pi/agent/settings.json`.
 */

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import registerSubagentExtension from "pi-subagents";
import { renderSubagentResult } from "pi-subagents/render";

const SUBAGENT_TOOL = "subagent";

interface ProgressLike {
	status?: string;
}
interface ResultLike {
	agent?: string;
	progress?: ProgressLike;
}
interface DetailsLike {
	results?: ResultLike[];
}

function buildQuietRenderResult(): (
	result: { details?: DetailsLike; content?: Array<{ type: string; text?: string }> },
	options: { expanded: boolean },
	theme: Theme,
) => unknown {
	return (result, options, theme) => {
		const r = result.details?.results?.[0];
		const status: string | undefined = r?.progress?.status;
		if (status !== "pending" && status !== "running") {
			return renderSubagentResult(result, options, theme);
		}
		// renderCall already shows "subagent <agent>" above — avoid repeating
		// the identity. Todo-style glyph + status (single line), directly
		// under the tool-call header. Glyphs mirror packages/rpiv-todo/
		// todo-overlay.ts:28-35 for a consistent status language across
		// overlays.
		const glyph = status === "pending" ? theme.fg("dim", "○") : theme.fg("warning", "◐");
		// Glyph at column 0 — aligned directly under the "s" of "subagent"
		// in the renderCall line above (pi prints that at column 0 too).
		return new Text(`${glyph} ${theme.fg("muted", status)}`, 0, 0);
	};
}

/**
 * Invoke nicobailon's registerSubagentExtension with a proxied pi that
 * overrides the "subagent" tool's renderResult on its way into the
 * extension runtime. Idempotent iff called once per session.
 */
export async function registerSubagentsWithQuietRenderer(pi: ExtensionAPI): Promise<void> {
	const quietRenderResult = buildQuietRenderResult();
	const wrappedPi = new Proxy(pi, {
		get(target, prop, receiver) {
			if (prop !== "registerTool") return Reflect.get(target, prop, receiver);
			return (tool: { name: string; renderResult?: unknown }) => {
				if (tool.name === SUBAGENT_TOOL) {
					return (target.registerTool as unknown as (t: unknown) => void)({
						...tool,
						renderResult: quietRenderResult,
					});
				}
				return (target.registerTool as unknown as (t: unknown) => void)(tool);
			};
		},
	});
	await registerSubagentExtension(wrappedPi);
}
