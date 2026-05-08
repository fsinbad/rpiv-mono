import type { Theme } from "@earendil-works/pi-coding-agent";
import { makeTheme } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it } from "vitest";

import { EqualizerView } from "./equalizer-view.js";

const WIDTH = 32;

// Tags fg(color, text) so tests can assert color-key + payload separately.
const taggedTheme = makeTheme({
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
}) as unknown as Theme;

function payload(line: string): string {
	const m = line.match(/^<[^>]+>([\s\S]*)<\/[^>]+>$/);
	return m ? (m[1] ?? "") : line;
}

function colorKey(line: string): string | undefined {
	const m = line.match(/^<([^>]+)>/);
	return m ? m[1] : undefined;
}

describe("EqualizerView.render()", () => {
	it("renders a single full-width row of spaces when no samples have arrived", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0, status: "recording" });
		const rows = view.render(WIDTH);
		expect(rows).toHaveLength(1);
		// level=0 → space; lastPushed starts undefined so push happens but stores 0.
		// Rightmost cell is the latest sample (a space at level=0).
		expect(payload(rows[0]).length).toBe(WIDTH);
		expect(payload(rows[0]).trim()).toBe("");
	});

	it("places the latest sample on the right and scrolls older samples leftward", () => {
		const view = new EqualizerView(taggedTheme);
		// Three distinct levels; last one should be the rightmost glyph.
		view.setProps({ level: 0.05, status: "recording" });
		view.setProps({ level: 0.2, status: "recording" });
		view.setProps({ level: 0.5, status: "recording" });
		const line = payload(view.render(WIDTH)[0]!);
		const trailing = line.slice(-3);
		// Three pushed samples → three non-space cells at the end, ascending by
		// the perceptual sqrt mapping (0.05 < 0.2 < 0.5).
		expect(trailing).not.toContain(" ");
		expect(trailing[0]).not.toBe(trailing[2]);
	});

	it("colors with accent while recording and dim when paused", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.3, status: "recording" });
		expect(colorKey(view.render(WIDTH)[0])).toBe("accent");
		view.setProps({ level: 0.3, status: "paused" });
		expect(colorKey(view.render(WIDTH)[0])).toBe("dim");
	});

	it("freezes the buffer while paused (no new samples scrolled in)", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.4, status: "recording" });
		const beforePause = payload(view.render(WIDTH)[0]!);
		view.setProps({ level: 0.9, status: "paused" });
		view.setProps({ level: 0.1, status: "paused" });
		const duringPause = payload(view.render(WIDTH)[0]!);
		expect(duringPause).toBe(beforePause);
	});

	it("dedupes identical consecutive levels so non-audio state changes don't shift the buffer", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.3, status: "recording" });
		const before = payload(view.render(WIDTH)[0]!);
		// Repeat the exact same level (e.g. a key press fires setProps with no
		// real audio change). Must not push another sample.
		view.setProps({ level: 0.3, status: "recording" });
		view.setProps({ level: 0.3, status: "recording" });
		const after = payload(view.render(WIDTH)[0]!);
		expect(after).toBe(before);
	});

	it("returns a single empty row when width is zero", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.5, status: "recording" });
		expect(view.render(0)).toEqual([""]);
	});

	it("scales perceptually so quiet speech is visible (level=0.04 → non-space glyph)", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.04, status: "recording" });
		const last = payload(view.render(WIDTH)[0]!).slice(-1);
		expect(last).not.toBe(" ");
	});
});
