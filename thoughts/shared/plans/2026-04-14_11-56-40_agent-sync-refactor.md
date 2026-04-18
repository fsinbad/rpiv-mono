---
date: 2026-04-14T11:56:40-0400
planner: Claude Code
git_commit: 5f3e5f8
branch: master
repository: rpiv-pi
topic: "Bundled-agent add/update/remove sync refactor"
tags: [plan, rpiv-core, agents-sync, manifest, session-start]
status: ready
design_source: "thoughts/shared/designs/2026-04-14_11-24-01_agent-sync-refactor.md"
last_updated: 2026-04-14
last_updated_by: Claude Code
---

# Bundled-agent add/update/remove sync refactor — Implementation Plan

## Overview

Evolve `extensions/rpiv-core/agents.ts` from existence-based copy/skip to content-aware diff with manifest-based managed-file tracking. A `.rpiv-managed.json` manifest in `.pi/agents/` tracks which files are rpiv-owned, enabling safe stale removal while preserving user-created files. Startup detects drift without applying; `/rpiv-update-agents` applies all changes and shows a categorized summary.

Design decisions, full architecture code, and verification notes are fixed in the design artifact — this plan only sequences them.

## Desired End State

1. First session in a fresh project: 9 bundled agents copied, manifest written, single "Copied 9" notice.
2. Subsequent unchanged sessions: silent — no notices.
3. User edits a managed agent: startup shows "1 agent(s) outdated. Run /rpiv-update-agents to sync." File is preserved.
4. `/rpiv-update-agents`: applies add/update/remove with categorized summary.
5. Bundle drops an agent: startup shows "1 agent(s) removed from bundle." File deleted only on command.
6. User-created agents in `.pi/agents/` are never touched (not in manifest, not in source list).
7. After sync, pi-subagents resolver dispatches named agents correctly (no `general-purpose` fallback for bundled types).

## What We're NOT Doing

- Content hashing (direct buffer comparison is sufficient at 9-file scale)
- Automated tests (none exist in repo; manual verification per Phase 1 criteria)
- pi-subagents resolver integration testing
- Re-running sync on `session_compact` / `session_tree` (sync remains session_start only)

---

## Phase 1: Sync engine + caller wiring

### Overview

Replace the existence-based `copyBundledAgents` with a content-aware `syncBundledAgents` engine backed by a `.rpiv-managed.json` manifest. Keep `copyBundledAgents` as a backward-compat wrapper. Update `index.ts` startup and `/rpiv-update-agents` to use the new result shape — startup shows drift notices (detect-only), command applies and reports categorized counts.

Collapses design slices 1-3 into one phase because all three mutate `extensions/rpiv-core/agents.ts` sequentially — splitting across worktrees would churn merges.

### Changes Required

#### 1. Expand imports + add types and manifest helpers
**File**: `extensions/rpiv-core/agents.ts`
**Changes**: Expand the `node:fs` import list (add `readFileSync`, `writeFileSync`, `unlinkSync`). Insert new `SyncError`/`SyncResult` interfaces, `emptySyncResult()` factory, and manifest helpers (`readManifest`, `writeManifest`, `bootstrapManifest`) after `BUNDLED_AGENTS_DIR` (line 25), before the Agent Auto-Copy section.

```typescript
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// (PACKAGE_ROOT and BUNDLED_AGENTS_DIR stay exactly as-is — lines 19-25)

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

	// -- Legacy aliases (backward compat for existing callers) --
	/** Alias: added + updated (files written by this run). */
	copied: string[];
	/** Alias: unchanged + pendingUpdate + files that errored during read and were not written. */
	skipped: string[];
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
		copied: [],
		skipped: [],
	};
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

const MANIFEST_FILE = ".rpiv-managed.json";

/**
 * Read the managed-file manifest from the target directory.
 * Returns an empty array on missing/invalid/unreadable manifest.
 * Fail-soft: never throws.
 */
function readManifest(targetDir: string): string[] {
	const manifestPath = join(targetDir, MANIFEST_FILE);
	if (!existsSync(manifestPath)) return [];
	try {
		const raw = readFileSync(manifestPath, "utf-8");
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((e): e is string => typeof e === "string");
	} catch {
		return [];
	}
}

/**
 * Write the managed-file manifest to the target directory.
 * Fail-soft: swallows write errors (permissions, disk full, etc.).
 */
function writeManifest(targetDir: string, filenames: string[]): void {
	const manifestPath = join(targetDir, MANIFEST_FILE);
	try {
		writeFileSync(manifestPath, JSON.stringify(filenames, null, 2) + "\n", "utf-8");
	} catch {
		// non-fatal — sync results will still be correct for this run;
		// next run will re-bootstrap if manifest is missing
	}
}

/**
 * Bootstrap the managed-file manifest on first run after upgrade.
 *
 * When no manifest exists, claims all existing destination files whose
 * names match the current bundled source list as rpiv-managed.
 * Writes the manifest and returns the managed set.
 *
 * If a manifest already exists, returns it as-is.
 */
function bootstrapManifest(targetDir: string, sourceNames: Set<string>): string[] {
	const existing = readManifest(targetDir);
	if (existing.length > 0) return existing;

	const managed: string[] = [];
	try {
		const destEntries = readdirSync(targetDir).filter((f) => f.endsWith(".md"));
		for (const name of destEntries) {
			if (sourceNames.has(name)) {
				managed.push(name);
			}
		}
	} catch {
		// dest dir may not exist yet — that's fine, empty manifest
	}

	writeManifest(targetDir, managed);
	return managed;
}
```

#### 2. Replace sync engine
**File**: `extensions/rpiv-core/agents.ts`
**Changes**: Replace the existing `copyBundledAgents` body (lines 28-59 of current file) with the new `syncBundledAgents` engine, followed by a thin backward-compat `copyBundledAgents` wrapper. Dual-mode: `apply=false` adds new + detects drift; `apply=true` applies add/update/remove. Per-file try/catch; errored-read files appear in both `errors` and the legacy `skipped` alias.

```typescript
// ---------------------------------------------------------------------------
// Agent Sync Engine
// ---------------------------------------------------------------------------

/**
 * Synchronize bundled agents from <PACKAGE_ROOT>/agents/ into <cwd>/.pi/agents/.
 *
 * When `apply` is false (session_start): adds new files only.
 * Detects pending updates and removals without applying them.
 * When `apply` is true (/rpiv-update-agents): adds new, overwrites changed
 * managed files, removes stale managed files.
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

	// 2. Bootstrap manifest and get managed set
	const managedNames = new Set(bootstrapManifest(targetDir, sourceNames));

	// 3. Process each source file
	for (const entry of sourceEntries) {
		const src = join(BUNDLED_AGENTS_DIR, entry);
		const dest = join(targetDir, entry);

		if (!existsSync(dest)) {
			try {
				copyFileSync(src, dest);
				result.added.push(entry);
			} catch (e) {
				result.errors.push({
					file: entry,
					op: "copy",
					message: e instanceof Error ? e.message : String(e),
				});
			}
			continue;
		}

		let srcContent: Buffer;
		let destContent: Buffer;
		try {
			srcContent = readFileSync(src);
		} catch (e) {
			result.errors.push({
				file: entry,
				op: "read-src",
				message: e instanceof Error ? e.message : String(e),
			});
			result.skipped.push(entry);
			continue;
		}
		try {
			destContent = readFileSync(dest);
		} catch (e) {
			result.errors.push({
				file: entry,
				op: "read-dest",
				message: e instanceof Error ? e.message : String(e),
			});
			result.skipped.push(entry);
			continue;
		}

		if (Buffer.compare(srcContent, destContent) === 0) {
			result.unchanged.push(entry);
			result.skipped.push(entry);
		} else if (apply) {
			try {
				copyFileSync(src, dest);
				result.updated.push(entry);
				result.copied.push(entry);
			} catch (e) {
				result.errors.push({
					file: entry,
					op: "copy",
					message: e instanceof Error ? e.message : String(e),
				});
			}
		} else {
			result.pendingUpdate.push(entry);
			result.skipped.push(entry);
		}
	}

	// 4. Process stale managed files (in manifest but not in source)
	for (const name of managedNames) {
		if (sourceNames.has(name)) continue;

		const destPath = join(targetDir, name);
		if (!existsSync(destPath)) continue;

		if (apply) {
			try {
				unlinkSync(destPath);
				result.removed.push(name);
			} catch (e) {
				result.errors.push({
					file: name,
					op: "remove",
					message: e instanceof Error ? e.message : String(e),
				});
			}
		} else {
			result.pendingRemove.push(name);
		}
	}

	// 5. Update manifest to reflect current source set (regardless of apply mode)
	writeManifest(targetDir, sourceEntries);

	// 6. Populate legacy `copied` alias (added + updated)
	for (const name of result.added) {
		result.copied.push(name);
	}
	// updated files were pushed to `copied` inline in the loop above

	return result;
}

// ---------------------------------------------------------------------------
// Backward-compatible wrapper
// ---------------------------------------------------------------------------

/**
 * Legacy entry point — delegates to syncBundledAgents.
 * Kept for backward compatibility; prefer syncBundledAgents for new callers.
 */
export function copyBundledAgents(cwd: string, overwrite: boolean): {
	copied: string[];
	skipped: string[];
} {
	return syncBundledAgents(cwd, overwrite);
}
```

#### 3. Switch import + session_start drift notice
**File**: `extensions/rpiv-core/index.ts`
**Changes**: Replace the `copyBundledAgents` import at line 27 with `syncBundledAgents` (plus `SyncResult` type if needed). Replace the session_start agent sync block (lines 60-67) to use `syncBundledAgents(ctx.cwd, false)`, notify for new adds, and emit a separate drift notice when `pendingUpdate` or `pendingRemove` is non-empty.

```typescript
// Line 27 — replace import
import { syncBundledAgents, type SyncResult } from "./agents.js";
```

```typescript
// Lines 60-67 — replace session_start block
		// Sync bundled agents into <cwd>/.pi/agents/
		// Detect-only mode: adds new files, detects drift, does NOT overwrite or remove.
		const agentResult = syncBundledAgents(ctx.cwd, false);
		if (ctx.hasUI) {
			if (agentResult.added.length > 0) {
				ctx.ui.notify(
					`Copied ${agentResult.added.length} rpiv-pi agent(s) to .pi/agents/`,
					"info",
				);
			}
			const driftCount = agentResult.pendingUpdate.length + agentResult.pendingRemove.length;
			if (driftCount > 0) {
				const parts: string[] = [];
				if (agentResult.pendingUpdate.length > 0) {
					parts.push(`${agentResult.pendingUpdate.length} outdated`);
				}
				if (agentResult.pendingRemove.length > 0) {
					parts.push(`${agentResult.pendingRemove.length} removed from bundle`);
				}
				ctx.ui.notify(
					`${parts.join(", ")} agent(s). Run /rpiv-update-agents to sync.`,
					"info",
				);
			}
		}
```

#### 4. Update `/rpiv-update-agents` command with categorized summary
**File**: `extensions/rpiv-core/index.ts`
**Changes**: Replace the command handler at lines 122-137 to call `syncBundledAgents(ctx.cwd, true)` and emit `added / updated / removed` counts plus any collected error messages. Update the `description` to match the new behavior.

```typescript
	// ── /rpiv-update-agents Command ────────────────────────────────────────
	pi.registerCommand("rpiv-update-agents", {
		description: "Sync rpiv-pi bundled agents into .pi/agents/: add new, update changed, remove stale",
		handler: async (_args, ctx) => {
			const result = syncBundledAgents(ctx.cwd, true);
			if (!ctx.hasUI) return;

			const totalSynced = result.added.length + result.updated.length + result.removed.length;
			if (totalSynced === 0 && result.errors.length === 0) {
				ctx.ui.notify("All agents already up-to-date.", "info");
				return;
			}

			const parts: string[] = [];
			if (result.added.length > 0) parts.push(`${result.added.length} added`);
			if (result.updated.length > 0) parts.push(`${result.updated.length} updated`);
			if (result.removed.length > 0) parts.push(`${result.removed.length} removed`);

			const summary = parts.length > 0
				? `Synced agents: ${parts.join(", ")}.`
				: "No changes needed.";

			if (result.errors.length > 0) {
				ctx.ui.notify(
					`${summary} ${result.errors.length} error(s): ${result.errors.map((e) => e.message).join("; ")}`,
					"warning",
				);
			} else {
				ctx.ui.notify(summary, "info");
			}
		},
	});
```

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles cleanly: `pnpm -w tsc --noEmit` (or the repo's equivalent build command) — skipped: no tsc/tsconfig in repo, not runnable locally
- [x] No stray references to the old signature: `grep -RIn "copyBundledAgents(ctx.cwd" extensions/rpiv-core/` returns only the backward-compat wrapper definition
- [x] Buffer compare is actually used: `grep -n "Buffer.compare" extensions/rpiv-core/agents.ts` returns exactly one line
- [x] Manifest filename constant present exactly once: `grep -n "\\.rpiv-managed\\.json" extensions/rpiv-core/agents.ts` returns the `MANIFEST_FILE` definition line

#### Manual Verification
- [x] **First-session bootstrap**: `rm -rf .pi/agents/` in a test project, start a new Pi session → all 9 bundled agents present, `.rpiv-managed.json` contains all 9 filenames, notice shows "Copied 9 rpiv-pi agent(s) to .pi/agents/"
- [ ] **User file preservation**: `touch .pi/agents/custom-agent.md`, run `/rpiv-update-agents` → `custom-agent.md` still exists; manifest does not list it
- [ ] **Stale removal**: append `"old-agent.md"` to `.rpiv-managed.json` and `touch .pi/agents/old-agent.md` → run `/rpiv-update-agents` → `old-agent.md` deleted, `old-agent.md` removed from manifest, notice includes "1 removed"
- [ ] **Drift detect-only**: edit any bundled agent (e.g., add a line to `.pi/agents/codebase-locator.md`), start new session → notice shows "1 outdated agent(s). Run /rpiv-update-agents to sync."; file content NOT overwritten
- [ ] **Drift apply**: from the state above, run `/rpiv-update-agents` → file content matches bundled source, notice shows "1 updated"
- [ ] **Resolver regression**: after any sync, dispatch a skill that invokes a named subagent (e.g., `codebase-locator`) → verify the agent widget reports its specific type, not `general-purpose`
- [ ] **Error resilience**: `chmod a-w .pi/agents/` on a file, start session → no crash; errors either silent at startup or reported only on command invocation

---

## Phase 2: Documentation updates

### Overview

Align README and guidance docs with the new detect-on-startup + apply-on-command contract. Strictly prose changes — no behavior. Runs after Phase 1 merges so doc examples match shipped behavior.

### Changes Required

#### 1. README first-session section
**File**: `README.md`
**Changes**: Replace the first-session bullet list at lines 38-41 so it mentions drift detection explicitly.

```markdown
On first session start, rpiv-pi automatically:
- Copies agent profiles to `<cwd>/.pi/agents/`
- Detects outdated or removed agents on subsequent starts
- Scaffolds `thoughts/shared/` directories for pipeline artifacts
- Shows a warning if any sibling plugins are missing
```

#### 2. README command table row
**File**: `README.md`
**Changes**: Replace the `/rpiv-update-agents` row at line 108 so the description reflects add/update/remove semantics.

```markdown
| `/rpiv-update-agents` | Sync rpiv agent profiles: add new, update changed, remove stale |
```

#### 3. README configuration bullet
**File**: `README.md`
**Changes**: Replace the agent-profiles bullet at line 146 so it clarifies that the command overwrites only rpiv-managed files.

```markdown
- **Agent profiles** — editable at `<cwd>/.pi/agents/`; sync from bundled defaults with `/rpiv-update-agents` (overwrites rpiv-managed files, preserves your custom agents)
```

#### 4. Agents guidance architecture
**File**: `.rpiv/guidance/agents/architecture.md`
**Changes**: Replace the second paragraph of the Responsibility section with the detect-on-startup description. Update the last bullet of the "Adding a New Agent" section to reference full-sync on command.

```markdown
At session start, `extensions/rpiv-core/agents.ts` syncs bundled `.md` files to `<cwd>/.pi/agents/` — adding new files and detecting outdated or removed agents (detect-only, no overwrite). Use `/rpiv-update-agents` to apply full sync: add new, update changed, remove stale managed files.
```

```markdown
8. The file is auto-synced to `<cwd>/.pi/agents/` at session start — no registration step needed. `/rpiv-update-agents` applies full sync including new agents.
```

#### 5. rpiv-core guidance architecture
**File**: `.rpiv/guidance/extensions/rpiv-core/architecture.md`
**Changes**: Update the Module Structure entry for `agents.ts` so it mentions the new sync-engine export.

```markdown
agents.ts, package-checks.ts  — pure utilities; no ExtensionAPI; filesystem/OS only. agents.ts provides syncBundledAgents() with manifest-based add/update/remove detection.
```

### Success Criteria

#### Automated Verification
- [x] No stale prose references to the old copy-and-overwrite contract: `grep -RIn "overwriting local edits\|re-copy" README.md .rpiv/guidance/` returns 0 matches
- [x] Guidance files reference the new symbol: `grep -RIn "syncBundledAgents" .rpiv/guidance/` returns exactly the rpiv-core architecture.md hit

#### Manual Verification
- [x] Render `README.md` (GitHub preview or local viewer) → first-session section reads cleanly, command table row is the updated wording, agent-profiles bullet reflects "preserves your custom agents"
- [x] Open `.rpiv/guidance/agents/architecture.md` → Responsibility paragraph and the "Adding a New Agent" step 8 both match the approved text
- [x] Open `.rpiv/guidance/extensions/rpiv-core/architecture.md` → Module Structure block mentions `syncBundledAgents()`

---

## Testing Strategy

### Automated
Project-level type check + ripgrep guards listed under each phase's Automated Verification. No unit-test suite exists in this repo.

### Manual Testing Steps

Run in a scratch project (or a throwaway clone) that has rpiv-pi linked, with `.pi/agents/` removed so bootstrap runs cleanly:

1. **Bootstrap**: `rm -rf .pi/agents/` → `pi` → verify 9 files + `.rpiv-managed.json` present, single "Copied 9" notice.
2. **No-op session**: exit Pi, start it again → no agent-related notices.
3. **User file preservation**: `echo "# mine" > .pi/agents/custom-agent.md` → `/rpiv-update-agents` → verify `custom-agent.md` survives and stays out of the manifest.
4. **Stale removal**: hand-edit `.rpiv-managed.json` to add `"ghost.md"`, `touch .pi/agents/ghost.md` → `/rpiv-update-agents` → verify `ghost.md` deleted and manifest cleaned.
5. **Drift detect**: append a line to `.pi/agents/codebase-locator.md`, restart session → verify "1 outdated" notice and that the file is unchanged.
6. **Drift apply**: from step 5 state, run `/rpiv-update-agents` → verify file matches bundled content and notice reports "1 updated".
7. **Bundle removal**: temporarily delete a bundled `agents/*.md` from the rpiv-pi checkout, restart session in the scratch project → verify "1 removed from bundle" notice at startup, file NOT deleted yet. Then `/rpiv-update-agents` → file removed. Restore the bundled file afterwards.
8. **Resolver check**: invoke `/skill:research-questions "test"` (or any skill that dispatches `codebase-locator`) → verify the named agent runs as its specific type, not a `general-purpose` fallback.
9. **Error path**: `chmod u-w .pi/agents/codebase-locator.md` then restart session → no crash; startup completes.

## Performance Considerations

- 9 files × `readFileSync` + `Buffer.compare` at session start is negligible (<5ms). Not a hot path.
- Manifest is a small JSON file (single array of strings). Read/write cost is trivial.
- No N+1 risks — single `readdirSync` for both source and destination, then in-memory set operations.

## Migration Notes

**Upgrade path for existing users**:
- First run after upgrade: no manifest exists → bootstrap runs, claims matching filenames as managed. Seamless.
- User-created agents in `.pi/agents/` that don't match bundled names: never claimed, never touched.
- Users who intentionally edited managed agents: edits preserved at startup, overwritten only on explicit `/rpiv-update-agents`. Same contract as before.

**No data migration, no schema changes, no irreversible operations.**

## References

- Design: `thoughts/shared/designs/2026-04-14_11-24-01_agent-sync-refactor.md`
- Research: `thoughts/shared/research/2026-04-14_10-45-44_subagent-sync-refactor.md`
- Questions: `thoughts/shared/questions/2026-04-14_10-23-03_subagent-sync-refactor.md`
- Prior discovery: `thoughts/shared/questions/2026-04-13_15-53-01_agent-resolution-in-plugin.md`
- Migration-era design: `thoughts/shared/designs/2026-04-10_11-18-29_complete-pi-migration.md` (Decision 5)
