/**
 * Agent auto-copy — copies bundled agents into <cwd>/.pi/agents/.
 *
 * Pure utility. No ExtensionAPI interactions.
 *
 * Concurrency: NOT safe across multiple Pi sessions sharing one cwd. Two
 * sessions racing here may produce a partial manifest where the loser's
 * mutations are untracked. Per-cwd advisory locking is a deferred follow-up
 * (see CHANGELOG known-limitations and review findings Q12/Q13). The path
 * allowlist in readManifest neutralises the worst-case (arbitrary-path
 * unlink) regardless of concurrency.
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Package-root resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the rpiv-pi package root from this module's file URL.
 * Walks up from `extensions/rpiv-core/agents.ts` to the repo root.
 */
export const PACKAGE_ROOT = (() => {
	const thisFile = fileURLToPath(import.meta.url);
	// extensions/rpiv-core/agents.ts -> rpiv-pi/
	return dirname(dirname(dirname(thisFile)));
})();

export const BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncError {
	file?: string;
	op: "read-src" | "read-dest" | "copy" | "remove" | "manifest-read" | "manifest-write" | "mkdir";
	message: string;
}

export interface SyncResult {
	/** New files copied (present in source, absent from destination). */
	added: string[];
	/** Existing managed files overwritten with updated source content. */
	updated: string[];
	/** Managed files whose destination content matches source exactly. */
	unchanged: string[];
	/** Stale managed files removed (present in manifest but absent from source). */
	removed: string[];
	/** Managed files with different destination content (detected but not applied). */
	pendingUpdate: string[];
	/** Managed files no longer in source (detected but not removed). */
	pendingRemove: string[];
	/** Per-file errors collected during sync. */
	errors: SyncError[];
}

/** Create an empty SyncResult with all arrays initialized. */
function emptySyncResult(): SyncResult {
	return {
		added: [],
		updated: [],
		unchanged: [],
		removed: [],
		pendingUpdate: [],
		pendingRemove: [],
		errors: [],
	};
}

// ---------------------------------------------------------------------------
// Path-traversal allowlist (I2 — hardens the manifest reader boundary)
// ---------------------------------------------------------------------------

/**
 * Allowlist for managed-agent filenames.
 *
 * Hardens the manifest reader against crafted keys that would otherwise drive
 * `readFileSync` / `unlinkSync` to a path-traversed target. Required: the value
 * must be a single basename (no separators), must not contain `..` or NUL, must
 * not be absolute, and must end in `.md`.
 */
function isManagedAgentName(name: string): boolean {
	if (typeof name !== "string" || name.length === 0) return false;
	if (name.includes("\0")) return false;
	if (name.includes("/") || name.includes("\\")) return false;
	if (name === "." || name === "..") return false;
	if (name.includes("..")) return false;
	if (isAbsolute(name)) return false;
	if (!name.endsWith(".md")) return false;
	return true;
}

/**
 * Resolve a managed-agent destination path under targetDir, asserting it stays
 * within targetDir. Defence-in-depth alongside `isManagedAgentName` — if a
 * future code path constructs a destPath without going through `readManifest`,
 * this still blocks the traversal.
 *
 * Returns `null` if the resolved path escapes `targetDir`.
 */
function safeJoin(targetDir: string, name: string): string | null {
	const resolved = resolve(targetDir, name);
	const root = resolve(targetDir) + sep;
	if (!resolved.startsWith(root)) return null;
	return resolved;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const MANIFEST_FILE = ".rpiv-managed.json";
/**
 * V2-active sentinel: empty sidecar file written the first time syncBundledAgents
 * commits a v2-shaped manifest. Decouples "v2 active" from manifest contents so
 * JSON corruption, partial writes, or empty-hash collapse cannot re-arm the
 * legacy-migration "package wins" branch.
 */
const V2_MARKER_FILE = ".rpiv-managed.v2";

/** Filename → sha256 hex of the content we last installed. Empty string = legacy / unknown. */
type Manifest = Record<string, string>;

/**
 * `hasV2Data` derives from this marker, NOT from manifest content. The marker
 * is created exactly once per project — on the first successful writeManifest
 * after migration — and survives JSON corruption, partial writes, and
 * empty-hash collapse. This makes the legacy-migration window deterministically
 * one-shot per project.
 */
function hasV2Marker(targetDir: string): boolean {
	return existsSync(join(targetDir, V2_MARKER_FILE));
}

/**
 * Commit the V2 sentinel marker. Fail-soft: a write failure leaves the marker
 * absent, so the next run will retry. Worst case the legacy-migration branch
 * re-arms exactly once more.
 */
function writeV2Marker(targetDir: string): void {
	try {
		writeFileSync(join(targetDir, V2_MARKER_FILE), "", "utf-8");
	} catch {
		// non-fatal — see comment above.
	}
}

function sha256(buf: Buffer | string): string {
	return createHash("sha256").update(buf).digest("hex");
}

/**
 * Read the managed-file manifest from the target directory.
 * Supports both v1 (string[]) and v2 (Record<string,string>) formats. v1 entries
 * migrate as `{name: ""}` — the empty hash marks them as unknown, forcing the
 * manual gate until a `/rpiv-update-agents` run baselines the real hash.
 *
 * Hardened against path-traversal: keys failing `isManagedAgentName` are dropped
 * silently. A subsequent `writeManifest` rewrites the on-disk manifest without
 * the rejected keys.
 *
 * Fail-soft: never throws.
 */
function readManifest(targetDir: string): Manifest {
	const manifestPath = join(targetDir, MANIFEST_FILE);
	if (!existsSync(manifestPath)) return {};
	try {
		const raw = readFileSync(manifestPath, "utf-8");
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			const out: Manifest = {};
			for (const e of parsed) if (typeof e === "string" && isManagedAgentName(e)) out[e] = "";
			return out;
		}
		if (parsed && typeof parsed === "object") {
			const out: Manifest = {};
			for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
				if (typeof k === "string" && typeof v === "string" && isManagedAgentName(k)) out[k] = v;
			}
			return out;
		}
		return {};
	} catch {
		return {};
	}
}

/**
 * Write the managed-file manifest to the target directory (v2 format).
 * Pushes a `{ op: "manifest-write" }` SyncError on failure so consumers
 * (notifyAgentSyncDrift, /rpiv-update-agents) can surface it instead of
 * silently swallowing permission / disk-full errors.
 */
function writeManifest(targetDir: string, manifest: Manifest, result: SyncResult): void {
	const manifestPath = join(targetDir, MANIFEST_FILE);
	try {
		const ordered: Manifest = {};
		for (const k of Object.keys(manifest).sort()) ordered[k] = manifest[k];
		writeFileSync(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`, "utf-8");
	} catch (e) {
		result.errors.push({
			op: "manifest-write",
			message: e instanceof Error ? e.message : String(e),
		});
	}
}

// ---------------------------------------------------------------------------
// Agent Sync Engine
// ---------------------------------------------------------------------------

/**
 * Synchronize bundled agents from <PACKAGE_ROOT>/agents/ into <cwd>/.pi/agents/.
 *
 * Resolution policy (apply=false, session_start):
 *   - New source files → always copied.
 *   - Existing files, dest === src → unchanged, hash recorded.
 *   - Existing files, dest ≠ src:
 *     - dest === recorded hash → auto-update (smart gate).
 *     - V2 marker absent (legacy v1, missing, or never-installed) → auto-update;
 *       package wins. Triggers exactly while transitioning to v2; the marker
 *       file (.rpiv-managed.v2) is written once committed and never re-fires
 *       for this project, surviving JSON corruption / partial writes / empty-
 *       hash collapse.
 *     - otherwise (V2 marker present, dest differs from recorded hash) →
 *       pendingUpdate (gated; respects user edits).
 *   - Stale managed files: same three-way decision applied to removal.
 *
 * apply=true (/rpiv-update-agents): force adds/updates/removes regardless of
 * recorded hash (manual override; user-edited files are overwritten).
 *
 * Atomicity: writeManifest runs BEFORE the destructive unlink loop so a crash
 * mid-sync leaves the manifest claiming files-already-removed (next run picks
 * those up via the vanish branch and reports them in result.removed).
 *
 * Never throws — errors are collected in `result.errors`.
 */
export function syncBundledAgents(cwd: string, apply: boolean): SyncResult {
	const result = emptySyncResult();

	if (!existsSync(BUNDLED_AGENTS_DIR)) {
		return result;
	}

	const targetDir = join(cwd, ".pi", "agents");
	try {
		mkdirSync(targetDir, { recursive: true });
	} catch (e) {
		result.errors.push({
			op: "mkdir",
			message: e instanceof Error ? e.message : "Failed to create target directory",
		});
		return result;
	}

	// 1. Enumerate source files
	let sourceEntries: string[];
	try {
		sourceEntries = readdirSync(BUNDLED_AGENTS_DIR).filter((f) => f.endsWith(".md"));
	} catch {
		result.errors.push({ op: "read-src", message: "Failed to read bundled agents directory" });
		return result;
	}

	const sourceNames = new Set(sourceEntries);
	const manifest = readManifest(targetDir);
	// hasV2Data: derives from the .rpiv-managed.v2 sidecar marker file, NOT from
	// manifest content. The marker is created on the first successful write and
	// survives JSON corruption, partial truncation, and empty-hash collapse —
	// making the legacy-migration "package wins" branch deterministically
	// one-shot per project.
	const hasV2Data = hasV2Marker(targetDir);
	const newManifest: Manifest = {};

	// 2. Process each source file (always carry forward knownHash on transient I/O — Q2/Q3/Q4)
	for (const entry of sourceEntries) {
		const src = join(BUNDLED_AGENTS_DIR, entry);
		const dest = safeJoin(targetDir, entry);
		const knownHash = manifest[entry] ?? "";
		if (dest === null) {
			// Defence-in-depth: sourceEntries are basenames from readdirSync, but if a
			// future change widens that input safeJoin still blocks the traversal.
			result.errors.push({ file: entry, op: "copy", message: "rejected unsafe path" });
			newManifest[entry] = knownHash;
			continue;
		}

		let srcContent: Buffer;
		try {
			srcContent = readFileSync(src);
		} catch (e) {
			result.errors.push({
				file: entry,
				op: "read-src",
				message: e instanceof Error ? e.message : String(e),
			});
			newManifest[entry] = knownHash;
			continue;
		}
		const srcHash = sha256(srcContent);

		if (!existsSync(dest)) {
			try {
				copyFileSync(src, dest);
				result.added.push(entry);
				newManifest[entry] = srcHash;
			} catch (e) {
				result.errors.push({
					file: entry,
					op: "copy",
					message: e instanceof Error ? e.message : String(e),
				});
				newManifest[entry] = knownHash;
			}
			continue;
		}

		let destContent: Buffer;
		try {
			destContent = readFileSync(dest);
		} catch (e) {
			result.errors.push({
				file: entry,
				op: "read-dest",
				message: e instanceof Error ? e.message : String(e),
			});
			newManifest[entry] = knownHash;
			continue;
		}
		const destHash = sha256(destContent);

		if (srcHash === destHash) {
			result.unchanged.push(entry);
			newManifest[entry] = srcHash;
			continue;
		}

		const safeSmartUpdate = !apply && knownHash !== "" && destHash === knownHash;
		const safeLegacyUpdate = !apply && !hasV2Data && knownHash === "";
		if (apply || safeSmartUpdate || safeLegacyUpdate) {
			try {
				copyFileSync(src, dest);
				result.updated.push(entry);
				newManifest[entry] = srcHash;
			} catch (e) {
				result.errors.push({
					file: entry,
					op: "copy",
					message: e instanceof Error ? e.message : String(e),
				});
				newManifest[entry] = knownHash;
			}
		} else {
			result.pendingUpdate.push(entry);
			newManifest[entry] = knownHash;
		}
	}

	// 3. Stale-removal: Pass A (classify) → Pass B (write manifest) → Pass C (commit unlinks).
	//    A crash between B and C leaves the manifest claiming files-already-removed; on next
	//    run those entries hit the vanish branch and tidy via result.removed (Q5).
	const toUnlink: { name: string; destPath: string }[] = [];
	for (const name of Object.keys(manifest)) {
		if (sourceNames.has(name)) continue;

		const knownHash = manifest[name];
		const destPath = safeJoin(targetDir, name);
		if (destPath === null) {
			// Defence-in-depth: readManifest already filters via isManagedAgentName,
			// but a future code path that injects entries past readManifest still gets blocked.
			result.errors.push({ file: name, op: "remove", message: "rejected unsafe path" });
			continue;
		}
		if (!existsSync(destPath)) {
			// Vanished tracked file: tidy from manifest AND surface as removed (Q5).
			result.removed.push(name);
			continue;
		}

		let destContent: Buffer;
		try {
			destContent = readFileSync(destPath);
		} catch (e) {
			result.errors.push({
				file: name,
				op: "read-dest",
				message: e instanceof Error ? e.message : String(e),
			});
			newManifest[name] = knownHash;
			continue;
		}
		const destHash = sha256(destContent);
		const safeSmartRemove = !apply && knownHash !== "" && destHash === knownHash;
		const safeLegacyRemove = !apply && !hasV2Data && knownHash === "";

		if (apply || safeSmartRemove || safeLegacyRemove) {
			toUnlink.push({ name, destPath });
		} else {
			result.pendingRemove.push(name);
			newManifest[name] = knownHash;
		}
	}

	// Pass B — persist manifest before destructive ops.
	writeManifest(targetDir, newManifest, result);
	// First-ever successful write commits the v2 marker (one-shot per project).
	// Intentional: even if every copyFileSync failed (disk full, EACCES, ...),
	// the manifest is `{}` and the marker still commits. Next run treats every
	// source entry as new (knownHash === "") with hasV2Data=true → routed to
	// pendingUpdate, never auto-overwritten. /rpiv-update-agents recovers.
	if (!hasV2Data && !result.errors.some((e) => e.op === "manifest-write")) {
		writeV2Marker(targetDir);
	}

	// Pass C — commit unlinks after the manifest is durable.
	for (const { name, destPath } of toUnlink) {
		try {
			unlinkSync(destPath);
			result.removed.push(name);
		} catch (e) {
			result.errors.push({
				file: name,
				op: "remove",
				message: e instanceof Error ? e.message : String(e),
			});
			// Re-introduce the entry into the manifest on disk so a future run retries.
			newManifest[name] = manifest[name];
		}
	}
	if (result.errors.some((e) => e.op === "remove")) {
		writeManifest(targetDir, newManifest, result);
	}

	return result;
}
