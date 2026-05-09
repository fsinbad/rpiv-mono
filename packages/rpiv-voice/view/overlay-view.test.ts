import type { Component } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import { initialVoiceState, type VoiceState } from "../state/state.js";
import { OverlayView } from "./overlay-view.js";
import type { ScreenContentStrategy } from "./screen-content-strategy.js";

// Minimal fake Component: emits a fixed line per call. The OverlayView
// pipeline pours these through pi-tui's Container, which preserves line count
// and prepends/appends per-child lines verbatim — so we can count rows and
// recognize markers ("D"/"S"/"=") without depending on Container styling.
function fakeLines(lines: string[]): Component {
	return {
		render: () => [...lines],
		invalidate: () => {},
	};
}

class FakeStrategy implements ScreenContentStrategy {
	constructor(
		readonly kind: "dictation" | "settings",
		private readonly rows: string[][],
	) {}
	children(): readonly Component[] {
		return this.rows.map(fakeLines);
	}
}

function makeOverlay(opts: { rows: number | undefined; dictation: string[][]; settings: string[][] }): OverlayView {
	return new OverlayView({
		tui: { terminal: { columns: 80, rows: opts.rows } },
		dictation: new FakeStrategy("dictation", opts.dictation),
		settings: new FakeStrategy("settings", opts.settings),
	});
}

function withScreen(state: VoiceState, screen: VoiceState["currentScreen"]): VoiceState {
	return { ...state, currentScreen: screen };
}

// Equalizer ON: bottom chrome = [DIVIDER, EQ-TOP, EQ-BOT, STATUS] = 4 rows.
// All tests in this file exercise the eq-enabled layout because that's the
// non-trivial chrome anchor. The eq-disabled path is exercised by the
// equalizer-view tests (component returns []) and the projections tests.
const DRAFT = { hallucinationFilterEnabled: true, equalizerEnabled: true };
const CHROME = [["DIVIDER"], ["EQ-TOP"], ["EQ-BOT"], ["STATUS"]];

describe("OverlayView height stabilization", () => {
	it("renders empty when state has not been set yet", () => {
		const overlay = makeOverlay({
			rows: 24,
			dictation: [["d1", "d2", "d3"], ...CHROME],
			settings: [["s1"], ...CHROME],
		});
		expect(overlay.render(80)).toEqual([]);
	});

	it("pads the shorter screen up to the high-water-mark of the taller one", () => {
		const overlay = makeOverlay({
			rows: 24,
			// dictation body = 5 rows
			dictation: [["d1", "d2", "d3", "d4", "d5"], ...CHROME],
			// settings body = 1 row
			settings: [["s1"], ...CHROME],
		});

		const dict = initialVoiceState(DRAFT);
		overlay.setProps({ state: dict });
		const dictRows = overlay.render(80);
		// 5 body + 4 chrome = 9 rows, no padding needed.
		expect(dictRows).toHaveLength(9);
		expect(dictRows[dictRows.length - 1]).toContain("STATUS");

		// Flip to settings — should pad up to 5 body rows even though settings
		// only has 1 row of body content.
		overlay.setProps({ state: withScreen(dict, "settings") });
		const settRows = overlay.render(80);
		expect(settRows).toHaveLength(9);
		expect(settRows[settRows.length - 1]).toContain("STATUS");
		expect(settRows[settRows.length - 2]).toContain("EQ-BOT");
		expect(settRows[settRows.length - 3]).toContain("EQ-TOP");
		expect(settRows[settRows.length - 4]).toContain("DIVIDER");
		// First 4 rows should be empty padding, then "s1", then 4 chrome rows.
		expect(settRows.slice(0, 4)).toEqual(["", "", "", ""]);
		expect(settRows[4]).toContain("s1");
	});

	it("never shrinks the high-water-mark once established", () => {
		const overlay = makeOverlay({
			rows: 24,
			dictation: [["d1", "d2", "d3", "d4"], ...CHROME],
			settings: [["s1"], ...CHROME],
		});
		const dict = initialVoiceState(DRAFT);

		overlay.setProps({ state: withScreen(dict, "settings") });
		const before = overlay.render(80);
		// 4 body (settings padded by dictation render) + 4 chrome = 8 rows.
		expect(before).toHaveLength(8);

		overlay.setProps({ state: dict });
		expect(overlay.render(80)).toHaveLength(8);

		overlay.setProps({ state: withScreen(dict, "settings") });
		const after = overlay.render(80);
		expect(after).toHaveLength(8);
	});

	it("pins divider + equalizer + status to the bottom four rows regardless of screen", () => {
		const overlay = makeOverlay({
			rows: 24,
			dictation: [["d1", "d2", "d3"], ...CHROME],
			settings: [["s1"], ...CHROME],
		});
		const dict = initialVoiceState(DRAFT);

		overlay.setProps({ state: dict });
		const dictRows = overlay.render(80);
		expect(dictRows[dictRows.length - 1]).toContain("STATUS");
		expect(dictRows[dictRows.length - 2]).toContain("EQ-BOT");
		expect(dictRows[dictRows.length - 3]).toContain("EQ-TOP");
		expect(dictRows[dictRows.length - 4]).toContain("DIVIDER");

		overlay.setProps({ state: withScreen(dict, "settings") });
		const settRows = overlay.render(80);
		expect(settRows[settRows.length - 1]).toContain("STATUS");
		expect(settRows[settRows.length - 2]).toContain("EQ-BOT");
		expect(settRows[settRows.length - 3]).toContain("EQ-TOP");
		expect(settRows[settRows.length - 4]).toContain("DIVIDER");
	});
});

describe("OverlayView clipToTerminalHeight integration", () => {
	it("top-clips when content exceeds 85% of terminal height", () => {
		// Terminal rows = 16 → maxRows = floor(16 * 0.85) = 13.
		const longBody = Array.from({ length: 12 }, (_, i) => `line-${i}`);
		const overlay = makeOverlay({
			rows: 16,
			dictation: [longBody, ...CHROME],
			settings: [["s1"], ...CHROME],
		});
		const dict = initialVoiceState(DRAFT);
		overlay.setProps({ state: dict });

		const rows = overlay.render(80);
		// 12 body + 4 chrome = 16 rendered, clipped to 13.
		expect(rows.length).toBe(13);
		// Bottom chrome must survive — the clip is from the top.
		expect(rows[rows.length - 1]).toContain("STATUS");
		expect(rows[rows.length - 2]).toContain("EQ-BOT");
		expect(rows[rows.length - 3]).toContain("EQ-TOP");
		expect(rows[rows.length - 4]).toContain("DIVIDER");
		// First content row should be one of the later body lines (top was dropped).
		const earliestSurvivingIdx = Number(rows[0].match(/line-(\d+)/)?.[1] ?? -1);
		expect(earliestSurvivingIdx).toBeGreaterThan(0);
	});

	it("falls back to 24 rows when terminal.rows is undefined", () => {
		// 24 rows → maxRows = 20. A 28-row payload should clip to 20.
		const longBody = Array.from({ length: 24 }, (_, i) => `line-${i}`);
		const overlay = makeOverlay({
			rows: undefined,
			dictation: [longBody, ...CHROME],
			settings: [["s1"], ...CHROME],
		});
		overlay.setProps({ state: initialVoiceState(DRAFT) });
		const rows = overlay.render(80);
		expect(rows.length).toBe(20);
		expect(rows[rows.length - 1]).toContain("STATUS");
	});

	it("respects the MIN_RENDER_ROWS=4 floor on tiny terminals", () => {
		// 1 row * 0.85 = 0 → floor 4.
		const overlay = makeOverlay({
			rows: 1,
			dictation: [["d1", "d2", "d3", "d4", "d5", "d6"], ...CHROME],
			settings: [["s1"], ...CHROME],
		});
		overlay.setProps({ state: initialVoiceState(DRAFT) });
		const rows = overlay.render(80);
		expect(rows.length).toBe(4);
		expect(rows[rows.length - 1]).toContain("STATUS");
	});
});
