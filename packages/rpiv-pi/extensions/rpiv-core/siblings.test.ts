import { describe, expect, it } from "vitest";
import { SIBLINGS } from "./siblings.js";

describe("SIBLINGS registry", () => {
	it("contains 7 entries", () => {
		expect(SIBLINGS).toHaveLength(7);
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
