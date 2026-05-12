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
import { isPlainObject, toErrorMessage } from "./utils.js";

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

/** Named constants for sync operation identifiers. */
export const SYNC_OP = {
	READ_SRC: "read-src",
	READ_DEST: "read-dest",
	COPY: "copy",
	REMOVE: "remove",
	MANIFEST_WRITE: "manifest-write",
	MKDIR: "mkdir",
} as const;

/** String union derived from SYNC_OP. */
export type SyncOp = (typeof SYNC_OP)[keyof typeof SYNC_OP];

export interface SyncError {
	file?: string;
	op: SyncOp;
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
		if (isPlainObject(parsed)) {
			const out: Manifest = {};
			for (const [k, v] of Object.entries(parsed)) {
				if (typeof v === "string" && isManagedAgentName(k)) out[k] = v;
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
			op: SYNC_OP.MANIFEST_WRITE,
			message: toErrorMessage(e),
		});
	}
}

// ---------------------------------------------------------------------------
// Predicate consolidation
// ---------------------------------------------------------------------------

/**
 * Unified safety gate for destructive operations (update + remove).
 * Returns true when the operation is safe to auto-apply without user consent:
 *   - Smart gate: recorded hash matches destination (user hasn't edited)
 *   - Legacy gate: no v2 marker and no recorded hash (pre-migration)
 */
function isSafeDestructiveOp(opts: { hasV2Data: boolean; knownHash: string; destHash: string }): boolean {
	const { hasV2Data, knownHash, destHash } = opts;
	const safeSmart = knownHash !== "" && destHash === knownHash;
	const safeLegacy = !hasV2Data && knownHash === "";
	return safeSmart || safeLegacy;
}

// ---------------------------------------------------------------------------
// Agent Sync Engine — extracted helpers
// ---------------------------------------------------------------------------

/**
 * Step 1: Enumerate source .md files from the bundled agents directory.
 * Returns null (with error pushed) on failure.
 */
function enumerateSourceFiles(result: SyncResult): string[] | null {
	try {
		return readdirSync(BUNDLED_AGENTS_DIR).filter((f) => f.endsWith(".md"));
	} catch {
		result.errors.push({ op: SYNC_OP.READ_SRC, message: "Failed to read bundled agents directory" });
		return null;
	}
}

/**
 * Step 2: Process each source file — copy new, record unchanged, update or gate.
 * Returns the new manifest built from source entries.
 */
function processSourceEntries(
	sourceEntries: string[],
	targetDir: string,
	manifest: Manifest,
	hasV2Data: boolean,
	apply: boolean,
	result: SyncResult,
): Manifest {
	const newManifest: Manifest = {};

	for (const entry of sourceEntries) {
		const src = join(BUNDLED_AGENTS_DIR, entry);
		const dest = safeJoin(targetDir, entry);
		const knownHash = manifest[entry] ?? "";
		if (dest === null) {
			result.errors.push({ file: entry, op: SYNC_OP.COPY, message: "rejected unsafe path" });
			newManifest[entry] = knownHash;
			continue;
		}

		let srcContent: Buffer;
		try {
			srcContent = readFileSync(src);
		} catch (e) {
			result.errors.push({ file: entry, op: SYNC_OP.READ_SRC, message: toErrorMessage(e) });
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
				result.errors.push({ file: entry, op: SYNC_OP.COPY, message: toErrorMessage(e) });
				newManifest[entry] = knownHash;
			}
			continue;
		}

		let destContent: Buffer;
		try {
			destContent = readFileSync(dest);
		} catch (e) {
			result.errors.push({ file: entry, op: SYNC_OP.READ_DEST, message: toErrorMessage(e) });
			newManifest[entry] = knownHash;
			continue;
		}
		const destHash = sha256(destContent);

		if (srcHash === destHash) {
			result.unchanged.push(entry);
			newManifest[entry] = srcHash;
			continue;
		}

		if (apply || isSafeDestructiveOp({ hasV2Data, knownHash, destHash })) {
			try {
				copyFileSync(src, dest);
				result.updated.push(entry);
				newManifest[entry] = srcHash;
			} catch (e) {
				result.errors.push({ file: entry, op: SYNC_OP.COPY, message: toErrorMessage(e) });
				newManifest[entry] = knownHash;
			}
		} else {
			result.pendingUpdate.push(entry);
			newManifest[entry] = knownHash;
		}
	}

	return newManifest;
}

/**
 * Step 3A: Classify stale entries (in manifest but absent from source).
 * Returns entries to unlink; pushes pendingRemove for gated entries.
 */
function classifyStaleEntries(
	manifest: Manifest,
	sourceNames: Set<string>,
	targetDir: string,
	hasV2Data: boolean,
	apply: boolean,
	newManifest: Manifest,
	result: SyncResult,
): { name: string; destPath: string }[] {
	const toUnlink: { name: string; destPath: string }[] = [];

	for (const name of Object.keys(manifest)) {
		if (sourceNames.has(name)) continue;

		const knownHash = manifest[name];
		const destPath = safeJoin(targetDir, name);
		if (destPath === null) {
			result.errors.push({ file: name, op: SYNC_OP.REMOVE, message: "rejected unsafe path" });
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
			result.errors.push({ file: name, op: SYNC_OP.READ_DEST, message: toErrorMessage(e) });
			newManifest[name] = knownHash;
			continue;
		}
		const destHash = sha256(destContent);

		if (apply || isSafeDestructiveOp({ hasV2Data, knownHash, destHash })) {
			toUnlink.push({ name, destPath });
		} else {
			result.pendingRemove.push(name);
			newManifest[name] = knownHash;
		}
	}

	return toUnlink;
}

/**
 * Step 3C: Commit unlink operations after the manifest is durable.
 * Re-introduces failed entries into newManifest so a future run retries.
 */
function commitStaleUnlinks(
	toUnlink: { name: string; destPath: string }[],
	manifest: Manifest,
	newManifest: Manifest,
	targetDir: string,
	result: SyncResult,
): void {
	for (const { name, destPath } of toUnlink) {
		try {
			unlinkSync(destPath);
			result.removed.push(name);
		} catch (e) {
			result.errors.push({ file: name, op: SYNC_OP.REMOVE, message: toErrorMessage(e) });
			// Re-introduce the entry into the manifest on disk so a future run retries.
			newManifest[name] = manifest[name];
		}
	}
	if (result.errors.some((e) => e.op === SYNC_OP.REMOVE)) {
		writeManifest(targetDir, newManifest, result);
	}
}

// ---------------------------------------------------------------------------
// Agent Sync Engine — orchestrator
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
			op: SYNC_OP.MKDIR,
			message: toErrorMessage(e, "Failed to create target directory"),
		});
		return result;
	}

	// 1. Enumerate source files
	const sourceEntries = enumerateSourceFiles(result);
	if (sourceEntries === null) return result;

	const sourceNames = new Set(sourceEntries);
	const manifest = readManifest(targetDir);
	const hasV2Data = hasV2Marker(targetDir);

	// 2. Process each source file
	const newManifest = processSourceEntries(sourceEntries, targetDir, manifest, hasV2Data, apply, result);

	// 3. Stale-removal: Pass A (classify) → Pass B (write manifest) → Pass C (commit unlinks).
	const toUnlink = classifyStaleEntries(manifest, sourceNames, targetDir, hasV2Data, apply, newManifest, result);

	// Pass B — persist manifest before destructive ops.
	writeManifest(targetDir, newManifest, result);
	if (!hasV2Data && !result.errors.some((e) => e.op === SYNC_OP.MANIFEST_WRITE)) {
		writeV2Marker(targetDir);
	}

	// Pass C — commit unlinks after the manifest is durable.
	commitStaleUnlinks(toUnlink, manifest, newManifest, targetDir, result);

	return result;
}
