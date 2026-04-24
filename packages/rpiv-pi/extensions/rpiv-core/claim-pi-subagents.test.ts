import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { claimPiSubagents } from "./claim-pi-subagents.js";

const SETTINGS_PATH = join(process.env.HOME!, ".pi", "agent", "settings.json");

function writeSettings(contents: unknown): void {
	mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
	writeFileSync(SETTINGS_PATH, JSON.stringify(contents), "utf-8");
}

function readSettings(): unknown {
	return JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
}

describe("claimPiSubagents", () => {
	it("no settings file → claimed: false", () => {
		expect(claimPiSubagents()).toEqual({ claimed: false });
	});

	it("invalid JSON → claimed: false, file byte-exact unchanged", () => {
		mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
		writeFileSync(SETTINGS_PATH, "{not json", "utf-8");
		expect(claimPiSubagents()).toEqual({ claimed: false });
		expect(readFileSync(SETTINGS_PATH, "utf-8")).toBe("{not json");
	});

	it("non-object top-level → claimed: false", () => {
		writeSettings([1, 2, 3]);
		expect(claimPiSubagents()).toEqual({ claimed: false });
		expect(readSettings()).toEqual([1, 2, 3]);
	});

	it("packages absent → claimed: false, file unchanged", () => {
		writeSettings({ theme: "dark" });
		expect(claimPiSubagents()).toEqual({ claimed: false });
		expect(readSettings()).toEqual({ theme: "dark" });
	});

	it("entry present → removed, siblings preserved", () => {
		writeSettings({
			theme: "dark",
			packages: ["npm:pi-perplexity", "npm:pi-subagents", "/Users/x/rpiv-mono/packages/rpiv-pi"],
		});
		expect(claimPiSubagents()).toEqual({ claimed: true });
		expect(readSettings()).toEqual({
			theme: "dark",
			packages: ["npm:pi-perplexity", "/Users/x/rpiv-mono/packages/rpiv-pi"],
		});
	});

	it("entry absent → no-op (idempotent)", () => {
		writeSettings({ packages: ["npm:pi-perplexity"] });
		const before = readFileSync(SETTINGS_PATH, "utf-8");
		expect(claimPiSubagents()).toEqual({ claimed: false });
		expect(readFileSync(SETTINGS_PATH, "utf-8")).toBe(before);
	});

	it("entry repeated → removes every occurrence", () => {
		writeSettings({ packages: ["npm:pi-subagents", "npm:pi-perplexity", "npm:pi-subagents"] });
		expect(claimPiSubagents()).toEqual({ claimed: true });
		expect(readSettings()).toEqual({ packages: ["npm:pi-perplexity"] });
	});
});
