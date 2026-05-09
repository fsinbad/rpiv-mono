import type { Theme } from "@earendil-works/pi-coding-agent";
import { makeTheme } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it } from "vitest";

import { EqualizerView } from "./equalizer-view.js";

const WIDTH = 60;

const taggedTheme = makeTheme({
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
}) as unknown as Theme;

function payload(line: string): string {
	return line.replace(/<\/?[^>]+>/g, "");
}

// All colour keys present in the row, in first-appearance order. Rows are
// painted as run-length-encoded shade segments — the gradient across the
// trapezoid silhouette emits multiple tags per row.
function colorKeys(line: string): string[] {
	const seen = new Set<string>();
	const order: string[] = [];
	for (const m of line.matchAll(/<([^/][^>]*)>/g)) {
		const key = m[1]!;
		if (seen.has(key)) continue;
		seen.add(key);
		order.push(key);
	}
	return order;
}

// Both rows now use the same lower-block ladder (bars grow from the bottom).
const BAR_AMP: Record<string, number> = {
	" ": 0,
	"▁": 1,
	"▂": 2,
	"▃": 3,
	"▄": 4,
	"▅": 5,
	"▆": 6,
	"▇": 7,
	"█": 8,
};

function rowAmps(line: string): number[] {
	return [...line].map((g) => BAR_AMP[g] ?? -1);
}

// Bottom row holds eighths 0..8; top row continues 9..16. Stacking gives the
// full 0..16 amplitude per column for the new design.
function totalAmps(top: string, bot: string): number[] {
	const t = rowAmps(top);
	const b = rowAmps(bot);
	return t.map((tv, i) => tv + (b[i] ?? 0));
}

describe("EqualizerView.render() — bottom-anchored lattice", () => {
	it("renders two rows", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.3, status: "recording", enabled: true });
		expect(view.render(WIDTH)).toHaveLength(2);
	});

	it("is fully invisible at silence (both rows entirely spaces)", () => {
		const view = new EqualizerView(taggedTheme);
		// Settle smoother + lattice to zero.
		for (let i = 0; i < 50; i++) view.setProps({ level: 0, status: "recording", enabled: true });
		const [top, bot] = view.render(WIDTH).map((r) => payload(r!));
		expect(top!.replace(/ /g, "")).toBe("");
		expect(bot!.replace(/ /g, "")).toBe("");
	});

	it("fills the bottom row before any top-row activity (bars grow upward)", () => {
		const view = new EqualizerView(taggedTheme);
		// Quiet input — total amp on most columns should stay within the bottom
		// row (0..8), so the top row has no activity even where the bottom row
		// is partially filled.
		for (let i = 0; i < 30; i++) view.setProps({ level: 0.04, status: "recording", enabled: true });
		const [top, bot] = view.render(WIDTH).map((r) => payload(r!));
		const tops = rowAmps(top!);
		const bots = rowAmps(bot!);
		for (let i = 0; i < WIDTH; i++) {
			// If top row is lit, the bottom row beneath it must be saturated.
			if (tops[i]! > 0) expect(bots[i]).toBe(8);
		}
	});

	it("renders a center-tall, edge-short silhouette", () => {
		const view = new EqualizerView(taggedTheme);
		for (let i = 0; i < 30; i++) view.setProps({ level: 0.3, status: "recording", enabled: true });
		const [top, bot] = view.render(WIDTH).map((r) => payload(r!));
		const h = totalAmps(top!, bot!);
		const left = h.slice(0, 8).reduce((a, b) => a + b, 0);
		const middle = h.slice(WIDTH / 2 - 4, WIDTH / 2 + 4).reduce((a, b) => a + b, 0);
		const right = h.slice(-8).reduce((a, b) => a + b, 0);
		expect(middle).toBeGreaterThan(left);
		expect(middle).toBeGreaterThan(right);
	});

	it("keeps the very edges at zero — equalizer never fills the row, however loud", () => {
		const view = new EqualizerView(taggedTheme);
		for (let i = 0; i < 30; i++) view.setProps({ level: 1.0, status: "recording", enabled: true });
		const [top, bot] = view.render(WIDTH).map((r) => payload(r!));
		const h = totalAmps(top!, bot!);
		// Trapezoid envelope hits hard-zero past PLATEAU+FADE — the leftmost and
		// rightmost cells stay blank, so the silhouette reads as a centred bell
		// rather than a full-width strip even at saturation.
		expect(h[0]).toBe(0);
		expect(h[WIDTH - 1]).toBe(0);
	});

	it("scales overall amplitude with audio level (loud taller than quiet)", () => {
		const quiet = new EqualizerView(taggedTheme);
		const loud = new EqualizerView(taggedTheme);
		for (let i = 0; i < 30; i++) {
			quiet.setProps({ level: 0.02, status: "recording", enabled: true });
			loud.setProps({ level: 0.6, status: "recording", enabled: true });
		}
		const sum = (top: string, bot: string) => totalAmps(top, bot).reduce((a, b) => a + b, 0);
		const [qt, qb] = quiet.render(WIDTH).map((r) => payload(r!));
		const [lt, lb] = loud.render(WIDTH).map((r) => payload(r!));
		expect(sum(lt!, lb!)).toBeGreaterThan(sum(qt!, qb!));
	});

	it("rises instantly on a loud onset — one tick is enough to reach the centre", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 1, status: "recording", enabled: true });
		const [top, bot] = view.render(WIDTH).map((r) => payload(r!));
		const h = totalAmps(top!, bot!);
		expect(h[Math.floor(WIDTH / 2)]).toBeGreaterThan(0);
	});

	it("holds peaks briefly after audio drops — silhouette freezes, then decays", () => {
		const view = new EqualizerView(taggedTheme);
		// Saturate the lattice on a peak.
		for (let i = 0; i < 30; i++) view.setProps({ level: 0.6, status: "recording", enabled: true });
		const peakRow = view
			.render(WIDTH)
			.map((r) => payload(r!))
			.join("\n");
		// First few silent ticks: hold latch keeps the level frozen at peak height.
		for (let n = 0; n < 4; n++) view.setProps({ level: 0, status: "recording", enabled: true });
		const heldRow = view
			.render(WIDTH)
			.map((r) => payload(r!))
			.join("\n");
		expect(heldRow).toBe(peakRow);
		// After the hold window expires gravity takes over — the silhouette
		// must be measurably shorter than it was at peak.
		for (let n = 0; n < 12; n++) view.setProps({ level: 0, status: "recording", enabled: true });
		const fallenRow = view
			.render(WIDTH)
			.map((r) => payload(r!))
			.join("\n");
		expect(fallenRow).not.toBe(peakRow);
		const [pt, pb] = peakRow.split("\n");
		const [ft, fb] = fallenRow.split("\n");
		const peakSum = totalAmps(pt!, pb!).reduce((a, b) => a + b, 0);
		const fallenSum = totalAmps(ft!, fb!).reduce((a, b) => a + b, 0);
		expect(fallenSum).toBeLessThan(peakSum);
	});

	it("decays asynchronously after silence — adjacent columns reach zero at different ticks", () => {
		const view = new EqualizerView(taggedTheme);
		for (let i = 0; i < 30; i++) view.setProps({ level: 0.6, status: "recording", enabled: true });
		view.render(WIDTH); // drain warm-up ticks
		const firstZeroAt = new Array<number>(WIDTH).fill(-1);
		for (let tick = 1; tick <= 60; tick++) {
			view.setProps({ level: 0, status: "recording", enabled: true });
			const [top, bot] = view.render(WIDTH).map((r) => payload(r!));
			const row = totalAmps(top!, bot!);
			for (let i = 0; i < WIDTH; i++) {
				if (firstZeroAt[i] === -1 && row[i] === 0) firstZeroAt[i] = tick;
			}
		}
		const distinctZeroTicks = new Set(firstZeroAt.filter((v) => v > 0));
		// If every bar fell at the same rate we'd see a single tick value here.
		expect(distinctZeroTicks.size).toBeGreaterThan(1);
	});

	it("keeps the silhouette static across renders when no new audio arrives", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.25, status: "recording", enabled: true });
		const a = view
			.render(WIDTH)
			.map((r) => payload(r!))
			.join("\n");
		const b = view
			.render(WIDTH)
			.map((r) => payload(r!))
			.join("\n");
		expect(b).toBe(a);
	});

	it("freezes the silhouette while paused (no live RMS ingest)", () => {
		const view = new EqualizerView(taggedTheme);
		for (let i = 0; i < 20; i++) view.setProps({ level: 0.4, status: "recording", enabled: true });
		const before = view
			.render(WIDTH)
			.map((r) => payload(r!))
			.join("\n");
		for (let i = 0; i < 20; i++) view.setProps({ level: 0.95, status: "paused", enabled: true });
		const during = view
			.render(WIDTH)
			.map((r) => payload(r!))
			.join("\n");
		expect(during).toBe(before);
	});

	it("paints the silhouette as a dim → muted → accent gradient while recording", () => {
		const view = new EqualizerView(taggedTheme);
		// Settle to a peak-ish gain so all three tiers are present in the row.
		for (let i = 0; i < 30; i++) view.setProps({ level: 0.6, status: "recording", enabled: true });
		const [top, bot] = view.render(WIDTH);
		const keysT = colorKeys(top!);
		const keysB = colorKeys(bot!);
		expect(keysT).toContain("accent");
		// Bottom row carries the full 0..8 range of the silhouette so all three
		// tiers must appear there. Top row only lights up where total amp > 8,
		// so it may be only accent depending on the gain.
		expect(keysB).toContain("accent");
		expect(keysB).toContain("muted");
		expect(keysB).toContain("dim");
	});

	it("collapses to a single dim segment per row while paused", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.3, status: "paused", enabled: true });
		const [top, bot] = view.render(WIDTH);
		expect(colorKeys(top!)).toEqual(["dim"]);
		expect(colorKeys(bot!)).toEqual(["dim"]);
	});

	it("returns two empty rows when width is zero", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.5, status: "recording", enabled: true });
		expect(view.render(0)).toEqual(["", ""]);
	});

	it("renders zero rows when disabled (component absent from layout)", () => {
		const view = new EqualizerView(taggedTheme);
		// Pump audio while disabled — view must not contribute any rows.
		for (let i = 0; i < 20; i++) view.setProps({ level: 0.4, status: "recording", enabled: false });
		expect(view.render(WIDTH)).toEqual([]);
	});

	it("does not ingest live RMS while disabled (silhouette stays at silence)", () => {
		const view = new EqualizerView(taggedTheme);
		// Pump loud audio while disabled.
		for (let i = 0; i < 20; i++) view.setProps({ level: 0.9, status: "recording", enabled: false });
		// Now enable — internal smoothed level should still be at zero, not 0.9.
		view.setProps({ level: 0, status: "recording", enabled: true });
		const [top, bot] = view.render(WIDTH).map((r) => payload(r!));
		expect(top!.replace(/ /g, "")).toBe("");
		expect(bot!.replace(/ /g, "")).toBe("");
	});

	it("keeps both rows the same character count at any width", () => {
		const view = new EqualizerView(taggedTheme);
		view.setProps({ level: 0.4, status: "recording", enabled: true });
		for (const w of [20, 40, 80, 120]) {
			const [top, bot] = view.render(w).map((r) => payload(r!));
			expect([...top!]).toHaveLength(w);
			expect([...bot!]).toHaveLength(w);
		}
	});
});
