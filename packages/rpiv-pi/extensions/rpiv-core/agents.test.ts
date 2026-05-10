import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_AGENTS_DIR, syncBundledAgents } from "./agents.js";

const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const bundledNames = () => readdirSync(BUNDLED_AGENTS_DIR).filter((f) => f.endsWith(".md"));
const bundledContent = (name: string) => readFileSync(join(BUNDLED_AGENTS_DIR, name), "utf-8");

let cwd: string;
let targetDir: string;
let manifestPath: string;
let markerPath: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "rpiv-agents-"));
	targetDir = join(cwd, ".pi", "agents");
	manifestPath = join(targetDir, ".rpiv-managed.json");
	markerPath = join(targetDir, ".rpiv-managed.v2");
});
afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
	vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// First run / brand-new install
// ─────────────────────────────────────────────────────────────────────────────

describe("syncBundledAgents — first-run (no manifest, empty target)", () => {
	it("copies every source .md and writes a v2 manifest with sha256 hashes", () => {
		const r = syncBundledAgents(cwd, false);
		const bundled = bundledNames();
		expect(r.added.sort()).toEqual(bundled.sort());
		expect(r.updated).toEqual([]);
		expect(r.errors).toEqual([]);

		expect(existsSync(manifestPath)).toBe(true);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(Array.isArray(manifest)).toBe(false);
		expect(typeof manifest).toBe("object");
		expect(Object.keys(manifest).sort()).toEqual(bundled.sort());
		for (const name of bundled) {
			expect(manifest[name]).toBe(sha256(readFileSync(join(BUNDLED_AGENTS_DIR, name))));
			expect(manifest[name]).toMatch(/^[a-f0-9]{64}$/);
		}
	});

	it("writes the .rpiv-managed.v2 sentinel marker after first successful sync", () => {
		syncBundledAgents(cwd, false);
		expect(existsSync(markerPath)).toBe(true);
		expect(readFileSync(markerPath, "utf-8")).toBe("");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Legacy v1 manifest one-shot migration (package wins on conflict)
// ─────────────────────────────────────────────────────────────────────────────

describe("syncBundledAgents — legacy v1 manifest one-shot migration", () => {
	it("silently records hash when dest already matches src (no overwrite)", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];
		writeFileSync(join(targetDir, target), bundledContent(target), "utf-8");
		writeFileSync(manifestPath, JSON.stringify([target]), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.unchanged).toContain(target);
		expect(r.updated).not.toContain(target);
		expect(r.pendingUpdate).not.toContain(target);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(manifest[target]).toBe(sha256(bundledContent(target)));
	});

	it("overwrites a user-edited bundled agent (package wins)", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];
		writeFileSync(join(targetDir, target), "user-edited content", "utf-8");
		writeFileSync(manifestPath, JSON.stringify([target]), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.updated).toContain(target);
		expect(r.pendingUpdate).not.toContain(target);
		expect(readFileSync(join(targetDir, target), "utf-8")).toBe(bundledContent(target));
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(manifest[target]).toBe(sha256(bundledContent(target)));
	});

	it("copies a bundled agent missing from disk (legacy install pre-dating the agent)", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		// Legacy manifest knows the OTHER agents; this one is "new" since their install
		const target = bundled[0];
		const legacyEntries = bundled.slice(1);
		for (const name of legacyEntries) writeFileSync(join(targetDir, name), bundledContent(name), "utf-8");
		writeFileSync(manifestPath, JSON.stringify(legacyEntries), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.added).toContain(target);
		expect(existsSync(join(targetDir, target))).toBe(true);
	});

	it("removes stale entries (in v1 manifest, no longer in source) when dest is unchanged", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "stale.md"), "old shipped content", "utf-8");
		writeFileSync(manifestPath, JSON.stringify(["stale.md"]), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.removed).toContain("stale.md");
		expect(r.pendingRemove).not.toContain("stale.md");
		expect(existsSync(join(targetDir, "stale.md"))).toBe(false);
	});

	it("removes stale entries even when dest was user-edited (legacy: no record to protect)", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "stale.md"), "user-edited stale content", "utf-8");
		writeFileSync(manifestPath, JSON.stringify(["stale.md"]), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.removed).toContain("stale.md");
		expect(existsSync(join(targetDir, "stale.md"))).toBe(false);
	});

	it("filters non-string entries from a v1 manifest and still removes valid stale ones", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "unrelated.md"), "stale", "utf-8");
		writeFileSync(manifestPath, JSON.stringify([42, null, "unrelated.md"]), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.errors).toEqual([]);
		expect(r.removed).toContain("unrelated.md");
		expect(existsSync(join(targetDir, "unrelated.md"))).toBe(false);
	});

	it("rewrites manifest as v2 with real hashes for every kept entry after migration", () => {
		mkdirSync(targetDir, { recursive: true });
		const bundled = bundledNames();
		for (const name of bundled) writeFileSync(join(targetDir, name), "stale legacy content", "utf-8");
		writeFileSync(manifestPath, JSON.stringify(bundled), "utf-8");

		syncBundledAgents(cwd, false);

		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(Array.isArray(manifest)).toBe(false);
		for (const name of bundled) {
			expect(manifest[name]).toBe(sha256(readFileSync(join(BUNDLED_AGENTS_DIR, name))));
		}
	});

	it("respects user edits on the SECOND session_start (post-migration v2 gate active)", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		const target = bundled[0];

		// Legacy migration: any disk content gets overwritten to canonical
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, target), "pre-migration drift", "utf-8");
		writeFileSync(manifestPath, JSON.stringify([target]), "utf-8");
		syncBundledAgents(cwd, false);
		// First successful sync commits the v2 marker (one-shot per project).
		expect(existsSync(markerPath)).toBe(true);

		// User edits AFTER migration
		writeFileSync(join(targetDir, target), "user customization", "utf-8");

		const r2 = syncBundledAgents(cwd, false);

		expect(r2.pendingUpdate).toContain(target);
		expect(r2.updated).not.toContain(target);
		expect(readFileSync(join(targetDir, target), "utf-8")).toBe("user customization");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Missing / corrupt manifest (treated as legacy-equivalent: package wins)
// ─────────────────────────────────────────────────────────────────────────────

describe("syncBundledAgents — missing/corrupt manifest", () => {
	it("first run with no manifest and pre-existing files matching src silently records hashes", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];
		writeFileSync(join(targetDir, target), bundledContent(target), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.unchanged).toContain(target);
		expect(r.added).not.toContain(target);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(manifest[target]).toBe(sha256(bundledContent(target)));
	});

	it("first run with no manifest and drift on disk overwrites to package version", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];
		writeFileSync(join(targetDir, target), "drift content", "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.updated).toContain(target);
		expect(readFileSync(join(targetDir, target), "utf-8")).toBe(bundledContent(target));
	});

	it("treats a corrupt JSON manifest with NO marker as missing (package wins, manifest rewritten as v2)", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(manifestPath, "{ not json ::", "utf-8");
		writeFileSync(join(targetDir, bundled[0]), "drift", "utf-8");
		expect(existsSync(markerPath)).toBe(false);

		const r = syncBundledAgents(cwd, false);

		expect(r.errors).toEqual([]);
		expect(r.updated).toContain(bundled[0]);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(typeof manifest).toBe("object");
		expect(Array.isArray(manifest)).toBe(false);
		// Marker committed after a successful manifest write closes the legacy window.
		expect(existsSync(markerPath)).toBe(true);
	});

	it("treats a non-array, non-object manifest (e.g. number) as missing", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(manifestPath, JSON.stringify(42), "utf-8");
		writeFileSync(join(targetDir, bundled[0]), "drift", "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.errors).toEqual([]);
		expect(r.updated).toContain(bundled[0]);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// v2 manifest smart gate (post-migration steady state)
// ─────────────────────────────────────────────────────────────────────────────

describe("syncBundledAgents — v2 manifest smart gate (apply=false)", () => {
	it("auto-updates when dest content matches recorded hash", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];

		const oldContent = "old version we previously installed";
		writeFileSync(join(targetDir, target), oldContent, "utf-8");
		// v2 manifest: hash matches what we just wrote, so "user hasn't edited"
		writeFileSync(manifestPath, JSON.stringify({ [target]: sha256(oldContent) }), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.updated).toContain(target);
		expect(r.pendingUpdate).not.toContain(target);
		expect(readFileSync(join(targetDir, target), "utf-8")).toBe(bundledContent(target));
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(manifest[target]).toBe(sha256(bundledContent(target)));
	});

	it("gates updates when dest differs from recorded hash (user edited)", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];

		writeFileSync(join(targetDir, target), "user edits", "utf-8");
		writeFileSync(manifestPath, JSON.stringify({ [target]: sha256("shipped version") }), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.pendingUpdate).toContain(target);
		expect(r.updated).not.toContain(target);
		expect(readFileSync(join(targetDir, target), "utf-8")).toBe("user edits");
	});

	it("auto-removes stale entries when dest matches recorded hash", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "removed.md"), "old removed agent", "utf-8");
		writeFileSync(manifestPath, JSON.stringify({ "removed.md": sha256("old removed agent") }), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.removed).toContain("removed.md");
		expect(existsSync(join(targetDir, "removed.md"))).toBe(false);
	});

	it("gates stale removal when dest differs from recorded hash", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "removed.md"), "user added notes", "utf-8");
		writeFileSync(manifestPath, JSON.stringify({ "removed.md": sha256("shipped") }), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.pendingRemove).toContain("removed.md");
		expect(r.removed).not.toContain("removed.md");
		expect(existsSync(join(targetDir, "removed.md"))).toBe(true);
	});

	it("treats a manually-removed dest as a new add on next sync", () => {
		syncBundledAgents(cwd, true);
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		rmSync(join(targetDir, bundled[0]));

		const r = syncBundledAgents(cwd, false);

		expect(r.added).toContain(bundled[0]);
	});

	it("reports unchanged on a quiescent second sync", () => {
		syncBundledAgents(cwd, true);
		const r = syncBundledAgents(cwd, false);
		expect(r.added).toEqual([]);
		expect(r.updated).toEqual([]);
		expect(r.pendingUpdate).toEqual([]);
		expect(r.unchanged.length).toBeGreaterThan(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Custom user agents (with v2 manifest active)
// ─────────────────────────────────────────────────────────────────────────────

describe("syncBundledAgents — custom user agents (v2 manifest active)", () => {
	it("ignores a custom user .md whose name does NOT match any bundled agent", () => {
		syncBundledAgents(cwd, true);
		const customPath = join(targetDir, "my-custom-agent.md");
		writeFileSync(customPath, "user content", "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.removed).not.toContain("my-custom-agent.md");
		expect(r.pendingRemove).not.toContain("my-custom-agent.md");
		expect(existsSync(customPath)).toBe(true);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(Object.keys(manifest)).not.toContain("my-custom-agent.md");
	});

	it("absorbs a hand-placed file matching a bundled name when content equals src", () => {
		const bundled = bundledNames();
		if (bundled.length < 2) return;
		// Baseline a v2 manifest that does NOT include `target` — simulating a user
		// who hand-placed `target` outside our control while we tracked the others.
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];
		const others = bundled.slice(1);
		const partial: Record<string, string> = {};
		for (const name of others) {
			writeFileSync(join(targetDir, name), bundledContent(name), "utf-8");
			partial[name] = sha256(bundledContent(name));
		}
		writeFileSync(manifestPath, JSON.stringify(partial), "utf-8");
		// User's hand-placed file happens to match canonical content
		writeFileSync(join(targetDir, target), bundledContent(target), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.unchanged).toContain(target);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(manifest[target]).toBe(sha256(bundledContent(target)));
	});

	it("gates a hand-placed file matching a bundled name with differing content (defensive)", () => {
		const bundled = bundledNames();
		if (bundled.length < 2) return;
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];
		const others = bundled.slice(1);
		const partial: Record<string, string> = {};
		for (const name of others) {
			writeFileSync(join(targetDir, name), bundledContent(name), "utf-8");
			partial[name] = sha256(bundledContent(name));
		}
		writeFileSync(manifestPath, JSON.stringify(partial), "utf-8");
		// V2 marker is what gates the project as v2-active (no longer manifest content)
		writeFileSync(markerPath, "", "utf-8");
		// User's hand-placed file diverges from canonical
		writeFileSync(join(targetDir, target), "user wrote this", "utf-8");

		const r = syncBundledAgents(cwd, false);

		// hasV2Data=true (marker present) → unknown entry is gated
		expect(r.pendingUpdate).toContain(target);
		expect(r.updated).not.toContain(target);
		expect(readFileSync(join(targetDir, target), "utf-8")).toBe("user wrote this");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// apply=true (forced sync via /rpiv-update-agents)
// ─────────────────────────────────────────────────────────────────────────────

describe("syncBundledAgents — apply=true (forced sync)", () => {
	it("overwrites a user-edited file even with v2 gate in place", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		syncBundledAgents(cwd, true);
		const target = bundled[0];
		writeFileSync(join(targetDir, target), "user-modified", "utf-8");

		const r = syncBundledAgents(cwd, true);

		expect(r.updated).toContain(target);
		expect(readFileSync(join(targetDir, target), "utf-8")).toBe(bundledContent(target));
	});

	it("removes a user-edited stale managed file", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "stale.md"), "user-edited stale", "utf-8");
		writeFileSync(manifestPath, JSON.stringify({ "stale.md": sha256("originally shipped content") }), "utf-8");

		const r = syncBundledAgents(cwd, true);

		expect(r.removed).toContain("stale.md");
		expect(existsSync(join(targetDir, "stale.md"))).toBe(false);
	});

	it("baselines real hashes from a v1 manifest (after-upgrade sync)", () => {
		syncBundledAgents(cwd, true);
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		// Roll back manifest to v1 form to simulate upgrade-then-/rpiv-update-agents
		writeFileSync(manifestPath, JSON.stringify(bundled), "utf-8");

		syncBundledAgents(cwd, true);

		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(Array.isArray(manifest)).toBe(false);
		for (const name of bundled) {
			expect(manifest[name]).toBe(sha256(readFileSync(join(BUNDLED_AGENTS_DIR, name))));
		}
	});

	it("leaves unchanged files alone", () => {
		syncBundledAgents(cwd, true);
		const r = syncBundledAgents(cwd, true);
		expect(r.updated).toEqual([]);
		expect(r.unchanged.length).toBeGreaterThan(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Manifest robustness (defensive parsing)
// ─────────────────────────────────────────────────────────────────────────────

describe("syncBundledAgents — manifest robustness", () => {
	it("filters non-string values from a v2 object manifest", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];
		// Mixed values: a real hash for `target`, garbage for two other entries
		writeFileSync(
			manifestPath,
			JSON.stringify({ [target]: sha256(bundledContent(target)), badNumber: 5, badNull: null }),
			"utf-8",
		);
		writeFileSync(join(targetDir, target), bundledContent(target), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.errors).toEqual([]);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(manifest[target]).toBe(sha256(bundledContent(target)));
		expect(manifest.badNumber).toBeUndefined();
		expect(manifest.badNull).toBeUndefined();
	});

	it("treats a partly-empty v2 manifest WITH MARKER as 'v2 active' and gates the empty entries", () => {
		const bundled = bundledNames();
		if (bundled.length < 2) return;
		mkdirSync(targetDir, { recursive: true });
		const [a, b] = bundled;
		writeFileSync(manifestPath, JSON.stringify({ [a]: sha256(bundledContent(a)), [b]: "" }), "utf-8");
		// Marker is what gates v2 — not the hash content.
		writeFileSync(markerPath, "", "utf-8");
		writeFileSync(join(targetDir, a), bundledContent(a), "utf-8");
		writeFileSync(join(targetDir, b), "user-edited content", "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.pendingUpdate).toContain(b);
		expect(r.updated).not.toContain(b);
		expect(readFileSync(join(targetDir, b), "utf-8")).toBe("user-edited content");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// I1 — V2 sentinel marker survives manifest content corruption
// ─────────────────────────────────────────────────────────────────────────────

describe("syncBundledAgents — I1: v2 sentinel marker", () => {
	it("with marker present and corrupt JSON manifest, gates user edits as pendingUpdate", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		syncBundledAgents(cwd, false); // first sync — writes marker
		expect(existsSync(markerPath)).toBe(true);

		const target = bundled[0];
		writeFileSync(join(targetDir, target), "user customization", "utf-8");
		writeFileSync(manifestPath, "{ corrupt :: not json", "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.updated).not.toContain(target);
		expect(r.pendingUpdate).toContain(target);
		expect(readFileSync(join(targetDir, target), "utf-8")).toBe("user customization");
	});

	it("with marker present and all-empty-hash manifest, gates user edits as pendingUpdate", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		syncBundledAgents(cwd, false);

		const target = bundled[0];
		writeFileSync(join(targetDir, target), "user customization", "utf-8");
		const empty: Record<string, string> = {};
		for (const name of bundled) empty[name] = "";
		writeFileSync(manifestPath, JSON.stringify(empty), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.updated).not.toContain(target);
		expect(r.pendingUpdate).toContain(target);
		expect(readFileSync(join(targetDir, target), "utf-8")).toBe("user customization");
	});

	it("with marker absent (truly fresh / pre-migration), legacy branch fires once", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		const target = bundled[0];
		writeFileSync(join(targetDir, target), "drift", "utf-8");
		expect(existsSync(markerPath)).toBe(false);

		const r1 = syncBundledAgents(cwd, false);
		expect(r1.updated).toContain(target);
		expect(existsSync(markerPath)).toBe(true);

		writeFileSync(join(targetDir, target), "post-migration user edit", "utf-8");
		const r2 = syncBundledAgents(cwd, false);
		expect(r2.updated).not.toContain(target);
		expect(r2.pendingUpdate).toContain(target);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Error paths
// ─────────────────────────────────────────────────────────────────────────────

describe("syncBundledAgents — I2: path-traversal hardening", () => {
	it("ignores manifest keys with `..` segments (no unlink, no read)", () => {
		mkdirSync(targetDir, { recursive: true });
		const sentinel = join(cwd, "sentinel.md");
		writeFileSync(sentinel, "DO NOT DELETE", "utf-8");
		writeFileSync(manifestPath, JSON.stringify({ "../../sentinel.md": "" }), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(existsSync(sentinel)).toBe(true);
		expect(r.removed).not.toContain("../../sentinel.md");
		expect(r.errors.some((e) => /unsafe|traversal/i.test(e.message))).toBe(false);
	});

	it("ignores absolute-path manifest keys", () => {
		mkdirSync(targetDir, { recursive: true });
		const sentinel = join(cwd, "abs.md");
		writeFileSync(sentinel, "absolute target", "utf-8");
		writeFileSync(manifestPath, JSON.stringify({ [sentinel]: "" }), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(existsSync(sentinel)).toBe(true);
		expect(r.removed.length).toBe(0);
	});

	it("ignores manifest keys not ending in .md", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(join(targetDir, "weird.txt"), "not an agent", "utf-8");
		writeFileSync(manifestPath, JSON.stringify({ "weird.txt": "" }), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.removed).not.toContain("weird.txt");
		expect(existsSync(join(targetDir, "weird.txt"))).toBe(true);
	});

	it("ignores v1-array entries with traversal segments", () => {
		mkdirSync(targetDir, { recursive: true });
		const sentinel = join(cwd, "v1-sentinel.md");
		writeFileSync(sentinel, "v1 target", "utf-8");
		writeFileSync(manifestPath, JSON.stringify(["../../v1-sentinel.md"]), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(existsSync(sentinel)).toBe(true);
		expect(r.removed).not.toContain("../../v1-sentinel.md");
	});

	it("ignores manifest keys containing a NUL byte", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(manifestPath, JSON.stringify({ "evil\u0000.md": "" }), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.errors).toEqual([]);
		expect(r.removed).not.toContain("evil\u0000.md");
	});
});

describe("syncBundledAgents — error paths", () => {
	it.skipIf(process.platform === "win32")("collects copy error when dest is read-only", () => {
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		mkdirSync(targetDir, { recursive: true });
		chmodSync(targetDir, 0o500);
		try {
			const r = syncBundledAgents(cwd, false);
			const errorTripped = r.errors.some((e) => e.op === "copy") || r.added.length < bundled.length;
			expect(errorTripped).toBe(true);
		} finally {
			chmodSync(targetDir, 0o700);
		}
	});

	it("does not throw when manifest claims a stale file that disappeared from disk (legacy mode)", () => {
		// Q5 contract: vanished tracked files surface as result.removed (not silently dropped).
		// This test exercises the legacy/no-marker branch; Q5 below covers the v2-marker branch.
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(manifestPath, JSON.stringify({ "stale.md": sha256("x") }), "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.errors).toEqual([]);
		expect(r.removed).toContain("stale.md");
		expect(r.pendingRemove).not.toContain("stale.md");
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(Object.keys(manifest)).not.toContain("stale.md");
	});

	it.skipIf(process.platform === "win32")("Q9: writeManifest failure surfaces op:'manifest-write' SyncError", () => {
		// Plan called for chmod(targetDir, 0o500), but POSIX dir-without-write still
		// permits writes to existing files inside, so writeManifest would not fail.
		// Read-only the manifest file itself to deterministically trigger EACCES on
		// the writeManifest open(O_WRONLY|O_TRUNC|O_CREAT).
		syncBundledAgents(cwd, true);
		const bundled = bundledNames();
		if (bundled.length === 0) return;
		writeFileSync(join(targetDir, bundled[0]), "drift", "utf-8");
		chmodSync(manifestPath, 0o400);

		try {
			const r = syncBundledAgents(cwd, true);
			expect(r.errors.some((e) => e.op === "manifest-write")).toBe(true);
		} finally {
			chmodSync(manifestPath, 0o600);
		}
	});

	it("Q18: mkdir failure tagged op:'mkdir' (not op:'manifest-write')", () => {
		// Plan called for vi.spyOn(fs, "mkdirSync"), but ESM module namespaces are
		// not configurable under this Vitest config. Inject the failure by placing
		// a regular file at `<cwd>/.pi` so mkdirSync(<cwd>/.pi/agents, {recursive:true})
		// fails with ENOTDIR — same observable: an op:"mkdir" SyncError.
		writeFileSync(join(cwd, ".pi"), "not a dir", "utf-8");

		const r = syncBundledAgents(cwd, false);

		expect(r.errors.some((e) => e.op === "mkdir")).toBe(true);
		expect(r.errors.some((e) => e.op === "manifest-write")).toBe(false);
	});

	it("Q5: pushes to result.removed when a tracked file has already vanished from disk (v2 active)", () => {
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(manifestPath, JSON.stringify({ "stale.md": sha256("x") }), "utf-8");
		writeFileSync(markerPath, "", "utf-8");
		// Note: 'stale.md' is NOT created on disk — it has vanished while still tracked.

		const r = syncBundledAgents(cwd, false);

		expect(r.removed).toContain("stale.md");
		expect(r.errors).toEqual([]);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		expect(Object.keys(manifest)).not.toContain("stale.md");
	});

	it.skipIf(process.platform === "win32")(
		"Q7: read-src failure preserves prior knownHash and reports op:'read-src'",
		() => {
			// Plan called for vi.spyOn(fs, "readFileSync"), but ESM module namespaces are
			// not configurable under this Vitest config (same constraint as Q18). Inject
			// the failure by chmod-ing one bundled-agent source file to 0o000 so that
			// readFileSync(src) throws EACCES; restore in finally.
			const bundled = bundledNames();
			if (bundled.length === 0) return;
			syncBundledAgents(cwd, false);
			const target = bundled[0];
			const baselined = JSON.parse(readFileSync(manifestPath, "utf-8"));
			const priorHash = baselined[target];
			expect(priorHash).toMatch(/^[a-f0-9]{64}$/);

			const srcPath = join(BUNDLED_AGENTS_DIR, target);
			const originalMode = statSync(srcPath).mode & 0o777;
			chmodSync(srcPath, 0o000);
			try {
				const r = syncBundledAgents(cwd, false);
				expect(r.errors.some((e) => e.op === "read-src" && e.file === target)).toBe(true);
				expect(r.pendingUpdate).not.toContain(target);
				const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
				expect(manifest[target]).toBe(priorHash);
			} finally {
				chmodSync(srcPath, originalMode);
			}
		},
	);

	it.skipIf(process.platform === "win32")("Q8: read-dest catch on stale-loop emits op:'read-dest'", () => {
		mkdirSync(targetDir, { recursive: true });
		const stalePath = join(targetDir, "stale.md");
		writeFileSync(stalePath, "managed content", "utf-8");
		writeFileSync(manifestPath, JSON.stringify({ "stale.md": sha256("managed content") }), "utf-8");
		writeFileSync(markerPath, "", "utf-8");
		chmodSync(stalePath, 0o000);

		try {
			const r = syncBundledAgents(cwd, false);
			expect(r.errors.some((e) => e.op === "read-dest" && e.file === "stale.md")).toBe(true);
		} finally {
			chmodSync(stalePath, 0o600);
		}
	});
});
