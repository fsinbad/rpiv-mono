import { describe, expect, it } from "vitest";
import { LEGACY_SIBLINGS, SIBLINGS } from "./siblings.js";

describe("SIBLINGS registry", () => {
	it("contains 6 entries (pi-subagents moved to LEGACY — rpiv-pi owns its registration)", () => {
		expect(SIBLINGS).toHaveLength(6);
	});

	it("does NOT list pi-subagents (superseded by subagent-widget proxy)", () => {
		expect(SIBLINGS.find((s) => s.pkg === "npm:pi-subagents")).toBeUndefined();
	});

	for (const s of SIBLINGS) {
		it(`${s.pkg} — self-match against settings.json line shape`, () => {
			expect(s.matches.test(s.pkg.replace(/^npm:/, ""))).toBe(true);
		});
		it(`${s.pkg} — case-insensitive match`, () => {
			expect(s.matches.test(s.pkg.toUpperCase().replace(/^NPM:/, ""))).toBe(true);
		});
	}

	it("rpiv-args does NOT match rpiv-args-extended (word boundary)", () => {
		const argsEntry = SIBLINGS.find((s) => s.pkg.endsWith("/rpiv-args"));
		expect(argsEntry).toBeDefined();
		expect(argsEntry?.matches.test("@juicesharp/rpiv-args-extended")).toBe(false);
	});

	it("every entry has non-empty pkg + provides", () => {
		for (const s of SIBLINGS) {
			expect(s.pkg.length).toBeGreaterThan(0);
			expect(s.provides.length).toBeGreaterThan(0);
		}
	});
});

describe("LEGACY_SIBLINGS registry", () => {
	it("lists pi-subagents for pruning (rpiv-pi claims the registration)", () => {
		const entry = LEGACY_SIBLINGS.find((l) => l.label === "pi-subagents");
		expect(entry).toBeDefined();
		expect(entry?.matches.test("npm:pi-subagents")).toBe(true);
		expect(entry?.matches.test("pi-subagents")).toBe(true);
	});

	it("pi-subagents legacy match does NOT catch @tintinweb/pi-subagents (separate legacy entry handles that)", () => {
		const piSubagents = LEGACY_SIBLINGS.find((l) => l.label === "pi-subagents");
		expect(piSubagents?.matches.test("@tintinweb/pi-subagents")).toBe(false);
	});

	it("pi-subagents legacy match does NOT catch pi-subagents-legacy (word boundary)", () => {
		const piSubagents = LEGACY_SIBLINGS.find((l) => l.label === "pi-subagents");
		expect(piSubagents?.matches.test("pi-subagents-legacy")).toBe(false);
	});
});
