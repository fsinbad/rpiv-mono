// Layout-stability contract (see issue doc in CHANGELOG 0.12.3): the
// aboveEditor overlay (widget.ts) is the authoritative live view. Pi
// re-invokes renderResult on every tool_execution_update while streaming,
// so the inline card must stay layout-stable — renderCall owns a 1-line
// trailer while running (card height = 2 from first paint, no 1↔2
// oscillation) and renderResult returns a zero-height stub until the
// terminal frame, then delegates to renderSubagentResult. The
// ctx.state.subagentTerminal flag flips the trailer off on the final frame
// so status text isn't duplicated next to the full result block.

import type { Theme } from "@mariozechner/pi-coding-agent";
import { type Component, Container, Text } from "@mariozechner/pi-tui";
import { renderSubagentResult } from "pi-subagents/render";

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

// "No progress yet" (pre-progress partial updates) counts as non-terminal —
// status must be a terminal string AND exitCode/stopReason must be present.
function isTerminal(r: ResultLike | undefined): boolean {
	if (!r) return false;
	const status = r.progress?.status;
	if (status === "pending" || status === "running") return false;
	return r.exitCode != null || r.stopReason != null;
}

interface SharedState {
	subagentTerminal?: boolean;
}

interface RenderCallCtx {
	executionStarted?: boolean;
	state?: SharedState;
}

interface RenderResultCtx {
	state?: SharedState;
}

function buildStatusTrailer(theme: Theme, ctx: RenderCallCtx): Text {
	// executionStarted flips true once Pi fires markExecutionStarted(); before
	// that the tool is only queued, not actually running.
	const running = ctx.executionStarted === true;
	const glyph = running ? theme.fg("warning", "◐") : theme.fg("dim", "○");
	const label = running ? "running" : "pending";
	return new Text(`${glyph} ${theme.fg("muted", label)}`, 0, 0);
}

const emptyStub = (): Text => new Text("", 0, 0);

export type OriginalRenderCall = (args: unknown, theme: Theme, ctx: unknown) => Component | undefined;

export type QuietRenderResult = (
	result: { details?: DetailsLike; content?: Array<{ type: string; text?: string }> },
	options: { expanded: boolean; isPartial?: boolean },
	theme: Theme,
	ctx?: unknown,
) => unknown;

function stack(header: Component, trailer: Component): Container {
	const container = new Container();
	container.addChild(header);
	container.addChild(trailer);
	return container;
}

export function buildQuietRenderCall(originalRenderCall: OriginalRenderCall | undefined): OriginalRenderCall {
	return (args, theme, ctx) => {
		const callCtx = (ctx ?? {}) as RenderCallCtx;
		const header = originalRenderCall?.(args, theme, ctx);
		if (callCtx.state?.subagentTerminal === true) return header ?? emptyStub();
		const trailer = buildStatusTrailer(theme, callCtx);
		return header ? stack(header, trailer) : trailer;
	};
}

export function buildQuietRenderResult(): QuietRenderResult {
	return (result, options, theme, ctx) => {
		const last = result.details?.results?.[0];
		const resultCtx = (ctx ?? {}) as RenderResultCtx;
		const isFinalFrame = isTerminal(last) && options.isPartial !== true;
		if (!isFinalFrame) return emptyStub();
		if (resultCtx.state) resultCtx.state.subagentTerminal = true;
		return renderSubagentResult(result, options, theme);
	};
}
