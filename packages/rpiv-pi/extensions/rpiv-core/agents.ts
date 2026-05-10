/**
 * Agent auto-copy — copies bundled agents into <cwd>/.pi/agents/.
 *
 * Pure utility. No ExtensionAPI interactions.
 */

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
	op: "read-src" | "read-dest" | "copy" | "remove" | "manifest-read" | "manifest-write";
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
// Manifest
// ---------------------------------------------------------------------------

const MANIFEST_FILE = ".rpiv-managed.json";

/** Filename → sha256 hex of the content we last installed. Empty string = legacy / unknown. */
type Manifest = Record<string, string>;

function sha256(buf: Buffer | string): string {
	return createHash("sha256").update(buf).digest("hex");
}

/**
 * Read the managed-file manifest from the target directory.
 * Supports both v1 (string[]) and v2 (Record<string,string>) formats. v1 entries
 * migrate as `{name: ""}` — the empty hash marks them as unknown, forcing the
 * manual gate until a `/rpiv-update-agents` run baselines the real hash.
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
			for (const e of parsed) if (typeof e === "string") out[e] = "";
			return out;
		}
		if (parsed && typeof parsed === "object") {
			const out: Manifest = {};
			for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
				if (typeof k === "string" && typeof v === "string") out[k] = v;
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
 * Fail-soft: swallows write errors (permissions, disk full, etc.).
 */
function writeManifest(targetDir: string, manifest: Manifest): void {
	const manifestPath = join(targetDir, MANIFEST_FILE);
	try {
		const ordered: Manifest = {};
		for (const k of Object.keys(manifest).sort()) ordered[k] = manifest[k];
		writeFileSync(manifestPath, `${JSON.stringify(ordered, null, 2)}\n`, "utf-8");
	} catch {
		// non-fatal — sync results will still be correct for this run;
		// next run will re-bootstrap if manifest is missing
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
 *     - manifest carries no v2 data (legacy v1, missing, or corrupt) → auto-update;
 *       package wins. One-shot per project: triggers exactly while transitioning
 *       to v2, then can never re-trigger because every touched file records a hash.
 *     - otherwise (v2 in place, dest differs from recorded hash) → pendingUpdate (gated;
 *       respects user edits).
 *   - Stale managed files: same three-way decision applied to removal.
 *
 * apply=true (/rpiv-update-agents): force adds/updates/removes regardless of
 * recorded hash (manual override; user-edited files are overwritten).
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
	} catch {
		result.errors.push({ op: "manifest-write", message: "Failed to create target directory" });
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
	// hasV2Data: any real recorded hash gates the project as "v2 active". Once
	// any one entry has a hash, we trust the manifest's protective semantics
	// and never silently overwrite unknown-hash entries — even if a few entries
	// happen to be empty due to error recovery or partial writes.
	const hasV2Data = Object.values(manifest).some((h) => h !== "");
	const newManifest: Manifest = {};

	// 2. Process each source file
	for (const entry of sourceEntries) {
		const src = join(BUNDLED_AGENTS_DIR, entry);
		const dest = join(targetDir, entry);
		const knownHash = manifest[entry] ?? "";

		let srcContent: Buffer;
		try {
			srcContent = readFileSync(src);
		} catch (e) {
			result.errors.push({
				file: entry,
				op: "read-src",
				message: e instanceof Error ? e.message : String(e),
			});
			if (knownHash) newManifest[entry] = knownHash;
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
				if (knownHash) newManifest[entry] = knownHash;
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
			if (knownHash) newManifest[entry] = knownHash;
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
				if (knownHash) newManifest[entry] = knownHash;
			}
		} else {
			result.pendingUpdate.push(entry);
			newManifest[entry] = knownHash;
		}
	}

	// 3. Process stale managed files (in manifest but not in source)
	for (const name of Object.keys(manifest)) {
		if (sourceNames.has(name)) continue;

		const destPath = join(targetDir, name);
		if (!existsSync(destPath)) continue; // already gone — drop from manifest

		const knownHash = manifest[name];
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
			try {
				unlinkSync(destPath);
				result.removed.push(name);
			} catch (e) {
				result.errors.push({
					file: name,
					op: "remove",
					message: e instanceof Error ? e.message : String(e),
				});
				newManifest[name] = knownHash;
			}
		} else {
			result.pendingRemove.push(name);
			newManifest[name] = knownHash;
		}
	}

	writeManifest(targetDir, newManifest);

	return result;
}
