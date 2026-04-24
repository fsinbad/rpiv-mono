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
	exitCode?: number;
	stopReason?: string;
}
interface DetailsLike {
	results?: ResultLike[];
}

// Layout-stable quiet card height: while the subagent is non-terminal, emit EXACTLY
// one `Text` line. If we fell through to the full renderer whenever progress.status
// was missing (pre-progress partial updates), the card would flip 1-line ↔ N-line
// every few frames mid-stream — same physical-row-stacking pathology that ghosted
// the overlay rows before the run-tracker newline fix.
//
// Terminal state: exitCode or stopReason is present on the last SingleResult AND
// progress.status is not in the running set. Anything else is treated as running,
// including "no progress yet" (status === undefined) and the first tool_execution_*
// frames before pi-subagents has stamped progress.
function isTerminal(r: ResultLike | undefined): boolean {
	if (!r) return false;
	const status = r.progress?.status;
	if (status === "pending" || status === "running") return false;
	return r.exitCode != null || r.stopReason != null;
}

export function buildQuietRenderResult(): (
	result: { details?: DetailsLike; content?: Array<{ type: string; text?: string }> },
	options: { expanded: boolean },
	theme: Theme,
) => unknown {
	return (result, options, theme) => {
		const r = result.details?.results?.[0];
		if (isTerminal(r)) {
			return renderSubagentResult(result, options, theme);
		}
		// Non-terminal → single-line status. Renders under the tool-call header,
		// glyph at column 0 to align with "subagent <agent>" above. Glyphs mirror
		// packages/rpiv-todo/todo-overlay.ts:28-35 for consistent status language.
		const status = r?.progress?.status ?? "running";
		const glyph = status === "pending" ? theme.fg("dim", "○") : theme.fg("warning", "◐");
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
