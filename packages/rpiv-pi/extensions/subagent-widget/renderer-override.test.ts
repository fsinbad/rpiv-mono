import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { describe, expect, it, vi } from "vitest";

// Stub the full renderer so the terminal-state branch returns a recognisable sentinel
// instead of executing nicobailon's real renderer (which needs a full Theme).
// vi.hoisted is required because vi.mock factories are top-hoisted and can't close
// over file-level consts.
const { renderSubagentResultMock } = vi.hoisted(() => ({
	renderSubagentResultMock: vi.fn(() => ({ __sentinel: "full-render" }) as unknown),
}));
vi.mock("pi-subagents/render", () => ({ renderSubagentResult: renderSubagentResultMock }));

import { buildQuietRenderResult } from "./renderer-override.js";

function makeTheme(): Theme {
	return {
		fg: (_c: string, t: string) => t,
		bold: (t: string) => t,
	} as unknown as Theme;
}

describe("buildQuietRenderResult — layout-stable quiet card", () => {
	it("emits ONE Text line when progress.status === 'running'", () => {
		const render = buildQuietRenderResult();
		const out = render(
			{ details: { results: [{ agent: "x", progress: { status: "running" } }] } },
			{ expanded: false },
			makeTheme(),
		);
		expect(out).toBeInstanceOf(Text);
		expect(renderSubagentResultMock).not.toHaveBeenCalled();
	});

	it("emits ONE Text line when progress.status === 'pending'", () => {
		const render = buildQuietRenderResult();
		const out = render(
			{ details: { results: [{ agent: "x", progress: { status: "pending" } }] } },
			{ expanded: false },
			makeTheme(),
		);
		expect(out).toBeInstanceOf(Text);
	});

	it("emits ONE Text line when progress is MISSING (pre-progress partial update)", () => {
		const render = buildQuietRenderResult();
		// First partialResult often arrives before pi-subagents stamps progress.
		// Previously fell through to full renderer → N-line card mid-stream →
		// layout shift → physical-row stacking. Now stays 1-line.
		const out = render({ details: { results: [{ agent: "x" }] } }, { expanded: false }, makeTheme());
		expect(out).toBeInstanceOf(Text);
		expect(renderSubagentResultMock).not.toHaveBeenCalled();
	});

	it("emits ONE Text line when result.details itself is missing (very first frame)", () => {
		const render = buildQuietRenderResult();
		const out = render({}, { expanded: false }, makeTheme());
		expect(out).toBeInstanceOf(Text);
	});

	it("delegates to full renderer once exitCode lands (terminal state)", () => {
		renderSubagentResultMock.mockClear();
		const render = buildQuietRenderResult();
		const out = render(
			{ details: { results: [{ agent: "x", exitCode: 0, progress: { status: "complete" } }] } },
			{ expanded: false },
			makeTheme(),
		);
		expect(renderSubagentResultMock).toHaveBeenCalledOnce();
		expect((out as { __sentinel?: string }).__sentinel).toBe("full-render");
	});

	it("delegates to full renderer on error stopReason", () => {
		renderSubagentResultMock.mockClear();
		const render = buildQuietRenderResult();
		const out = render(
			{ details: { results: [{ agent: "x", stopReason: "error" }] } },
			{ expanded: false },
			makeTheme(),
		);
		expect(renderSubagentResultMock).toHaveBeenCalledOnce();
		expect((out as { __sentinel?: string }).__sentinel).toBe("full-render");
	});

	it("treats exitCode present + status=running as NON-terminal (streaming finalisation window)", () => {
		renderSubagentResultMock.mockClear();
		const render = buildQuietRenderResult();
		// Mid-transition frames can have exitCode set before progress.status
		// leaves "running". Should stay quiet until status clears.
		const out = render(
			{ details: { results: [{ agent: "x", exitCode: 0, progress: { status: "running" } }] } },
			{ expanded: false },
			makeTheme(),
		);
		expect(out).toBeInstanceOf(Text);
		expect(renderSubagentResultMock).not.toHaveBeenCalled();
	});
});
