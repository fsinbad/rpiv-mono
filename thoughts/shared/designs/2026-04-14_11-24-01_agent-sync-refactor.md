---
date: 2026-04-14T11:24:01-0400
designer: Sergii
git_commit: 5f3e5f8
branch: master
repository: rpiv-pi
topic: "Bundled-agent add/update/remove sync refactor"
tags: [design, rpiv-core, agents-sync, manifest, session-start]
status: complete
research_source: "thoughts/shared/research/2026-04-14_10-45-44_subagent-sync-refactor.md"
last_updated: 2026-04-14T11:30:00-0400
last_updated_by: Sergii
---

# Design: Bundled-agent add/update/remove sync refactor

## Summary

Evolve `extensions/rpiv-core/agents.ts` from existence-based copy/skip to content-aware diff with manifest-based managed-file tracking. A `.rpiv-managed.json` manifest in `.pi/agents/` tracks which files are rpiv-owned, enabling safe stale removal while preserving user-created files. Startup detects drift (pending updates/removals) without applying; `/rpiv-update-agents` applies all changes and shows a categorized summary.

## Requirements

- Detect add/update/unchanged/removed states for bundled agent files
- Track rpiv-managed file ownership via manifest (`.pi/agents/.rpiv-managed.json`)
- Bootstrap manifest on first run after upgrade by matching existing filenames against bundled source
- Startup: add new managed files, detect but do NOT apply updates or removals, show drift notice
- Command (`/rpiv-update-agents`): apply all changes — add new, overwrite changed managed, remove stale managed
- Preserve user-created files in `.pi/agents/` (never remove non-managed files)
- Fail-soft at startup (per-file try/catch, never throw)
- Maintain backward compatibility with `copied`/`skipped` result fields
- Update README and guidance docs to reflect new behavior

## Current State Analysis

### Key Discoveries

- `extensions/rpiv-core/agents.ts:36-59` — current sync is existence-only: `if (!overwrite && existsSync(dest))` skips; no content comparison, no removal, no managed-set tracking.
- `extensions/rpiv-core/index.ts:61` — startup calls `copyBundledAgents(ctx.cwd, false)` (skip-if-exists).
- `extensions/rpiv-core/index.ts:126` — `/rpiv-update-agents` calls `copyBundledAgents(ctx.cwd, true)` (force overwrite all).
- `agents/` directory contains exactly 9 bundled `.md` files — deterministic source list.
- `@tintinweb/pi-subagents` reloads agents from `.pi/agents/` on every `Agent` tool call (upstream `src/index.ts:728`; verifiable locally at `dist/index.js:641` and `dist/index.js:220-225`) — sync outcomes are runtime-load-bearing immediately.
- `@tintinweb/pi-subagents` silently falls back to `general-purpose` for unknown subagent types (upstream `src/index.ts:730-732`; verifiable locally at `dist/index.js:644`, user-facing note at `dist/index.js:838`), masking sync regressions.
- `extensions/rpiv-core/agents.ts:7` — no `unlinkSync`/`rmSync` import exists; stale cleanup path is absent.
- `extensions/rpiv-core/git-context.ts:68-74` — existing "changed vs unchanged" pattern via signature comparison.
- `scripts/migrate.js:214-231` — existing safe deletion pattern: only after successful writes, per-file try/catch.
- `extensions/rpiv-core/package-checks.ts:21-30` — existing JSON config read/write with fail-soft pattern.

## Scope

### Building

- `extensions/rpiv-core/agents.ts` — new `SyncResult` type, manifest helpers, `syncBundledAgents()` core engine, backward-compat `copyBundledAgents()` wrapper
- `extensions/rpiv-core/index.ts` — updated startup notification logic, updated command reporting with categorized summary
- `README.md` — updated agent-sync docs reflecting detect-on-startup + apply-on-command
- `.rpiv/guidance/agents/architecture.md` — updated sync behavior description
- `.rpiv/guidance/extensions/rpiv-core/architecture.md` — updated module structure and utility description

### Not Building

- Content hashing (direct buffer comparison sufficient at 9-file scale)
- Automated tests (none exist in repo; manual verification specified)
- pi-subagents resolver integration testing
- Session_compact/session_tree sync re-runs (sync is session_start only per current design)

## Decisions

### Decision 1 — Managed-file identity: filename match

**Ambiguity**: How should the system know which `.pi/agents/*.md` files are rpiv-managed vs user-created?

**Explored**:
- Option A: Match by filename against current bundled source list — deterministic, no historical state needed
- Option B: Embedded marker in copied `.md` files — requires mutating agent content, conflicts with user edits
- Option C: Content fingerprinting — weaker if user edited files, more complex

**Decision**: Option A. The bundled source list (`agents/*.md`) is the canonical managed set. Any `.pi/agents/*.md` whose filename matches a current bundled filename is rpiv-managed, regardless of local edits. Enables safe removal of only managed files.

### Decision 2 — Manifest file: `.pi/agents/.rpiv-managed.json`

**Decision**: A JSON manifest in `.pi/agents/` recording the set of rpiv-managed filenames. Written on every sync run. Read side follows `package-checks.ts:21-30` (JSON read with fail-soft default). Write side has no exact local precedent — use the same try/catch-and-swallow posture as `guidance.ts:130-138` and the category-summary buckets at `index.ts:203-239`. Enables tracking across sessions and distinguishing managed vs user-created files for safe removal.

### Decision 3 — Manifest bootstrap: claim matching filenames on first run

**Ambiguity**: On first run after upgrade, no manifest exists. How to determine managed set?

**Decision**: Enumerate existing `.pi/agents/*.md` files; any whose filename matches a current bundled source is claimed as managed. Write manifest immediately. This is deterministic and requires no historical state.

### Decision 4 — Startup behavior: detect-only + add new + show drift notice

**Ambiguity**: Should startup apply updates to changed managed files?

**Decision**: Startup adds new managed files (files in bundled source but not in destination). For existing managed files with changed content, startup records `pendingUpdate` but does NOT overwrite. For stale managed files (in manifest but not in bundled source), startup records `pendingRemove` but does NOT delete. Shows a notice if any pending items exist. Preserves user edits across sessions until explicit `/rpiv-update-agents`.

### Decision 5 — Command behavior: apply all changes

**Decision**: `/rpiv-update-agents` adds new files, overwrites all managed files with bundled versions, removes stale managed files, updates manifest. Shows categorized summary (added/updated/removed).

### Decision 6 — Error handling: per-file fail-soft

**Decision**: Wrap each file operation in try/catch. Collect errors in `result.errors`. Never throw from sync functions. Pattern from `package-checks.ts:21-30` and `guidance.ts:130-138`.

### Decision 7 — Backward compatibility: `copied`/`skipped` aliases

**Decision**: `SyncResult` includes both new fields (`added`, `updated`, `unchanged`, `removed`, `pendingUpdate`, `pendingRemove`, `errors`) and legacy fields (`copied` = added + updated, `skipped` = unchanged + pendingUpdate + files that errored during read and were not written). Existing callers work without changes beyond notification text. Errored files deliberately appear in `skipped` so legacy callers that only inspect `copied`/`skipped` don't silently drop them.

### Decision 8 — Startup notice for drift detection

**Decision**: When startup detects pending updates or removals, show a one-line notice: "N agent(s) outdated, N removed from bundle. Run /rpiv-update-agents to sync." Informative without being noisy.

## Architecture

### extensions/rpiv-core/agents.ts — MODIFY (types + helpers)

Add after the existing `BUNDLED_AGENTS_DIR` constant (line 25), before the Agent Auto-Copy section:

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
	/** Alias: unchanged + pendingUpdate (files not written). */
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

	// No manifest — bootstrap by matching existing dest files against source
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

### extensions/rpiv-core/agents.ts — MODIFY (sync engine)

Replaces the old `copyBundledAgents` section (lines 28-59). Insert after the manifest helpers:

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
			// New file — always copy
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

		// Existing file — compare content
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
			// Overwrite with bundled version
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
			// Detect only — don't overwrite
			result.pendingUpdate.push(entry);
			result.skipped.push(entry);
		}
	}

	// 4. Process stale managed files (in manifest but not in source)
	for (const name of managedNames) {
		if (sourceNames.has(name)) continue;

		const destPath = join(targetDir, name);
		if (!existsSync(destPath)) continue; // already gone

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

	// 6. Populate legacy aliases
	// added files are also "copied"
	for (const name of result.added) {
		result.copied.push(name);
	}
	// updated files already added to copied in the loop above

	return result;
}
```

### extensions/rpiv-core/agents.ts — MODIFY (backward-compat wrapper)

Replaces the old `copyBundledAgents` function body (lines 36-59). Keep the function signature for any external consumers:

```typescript
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

### extensions/rpiv-core/index.ts:27 — MODIFY (import)

```typescript
import { syncBundledAgents, type SyncResult } from "./agents.js";
```

### extensions/rpiv-core/index.ts:60-67 — MODIFY (session_start agent sync)

Replace the current agent sync block:

```typescript
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

### extensions/rpiv-core/index.ts:123-136 — MODIFY (/rpiv-update-agents)

Replace the current command handler:

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

### README.md — MODIFY (agent-sync docs)

**First-session section** (replace `README.md:38-40`):

```markdown
On first session start, rpiv-pi automatically:
- Copies agent profiles to `<cwd>/.pi/agents/`
- Detects outdated or removed agents on subsequent starts
- Scaffolds `thoughts/shared/` directories for pipeline artifacts
- Shows a warning if any sibling plugins are missing
```

**Command table** (replace `README.md:108` row):

```markdown
| `/rpiv-update-agents` | Sync rpiv agent profiles: add new, update changed, remove stale |
```

**Configuration section** (replace `README.md:146` row):

```markdown
- **Agent profiles** — editable at `<cwd>/.pi/agents/`; sync from bundled defaults with `/rpiv-update-agents` (overwrites rpiv-managed files, preserves your custom agents)
```

### .rpiv/guidance/agents/architecture.md — MODIFY (sync behavior)

Replace the second paragraph of the Responsibility section:

```markdown
At session start, `extensions/rpiv-core/agents.ts` syncs bundled `.md` files to `<cwd>/.pi/agents/` — adding new files and detecting outdated or removed agents (detect-only, no overwrite). Use `/rpiv-update-agents` to apply full sync: add new, update changed, remove stale managed files.
```

Update the last bullet in the "Adding a New Agent" section:

```markdown
8. The file is auto-synced to `<cwd>/.pi/agents/` at session start — no registration step needed. `/rpiv-update-agents` applies full sync including new agents.
```

### .rpiv/guidance/extensions/rpiv-core/architecture.md — MODIFY (module structure)

Update the Module Structure section to reflect expanded agents.ts:

```markdown
agents.ts, package-checks.ts  — pure utilities; no ExtensionAPI; filesystem/OS only. agents.ts provides syncBundledAgents() with manifest-based add/update/remove detection.
```

## Desired End State

After implementation:

1. **First session in new project**: startup copies all 9 bundled agents, writes manifest, shows "Copied 9 agents" notice.

2. **Subsequent sessions (no changes)**: startup detects all unchanged, shows nothing. Manifest is still current.

3. **After user edits a managed agent**: startup detects the edit as `pendingUpdate`, shows "1 agent(s) outdated. Run /rpiv-update-agents to sync." User's edit is preserved.

4. **User runs `/rpiv-update-agents`**: overwrites all managed files with bundled versions, updates manifest, shows "Updated 9 agent(s)" (or categorized count).

5. **After rpiv-pi removes an agent from bundled source**: startup detects stale manifest entry as `pendingRemove`, shows "1 agent(s) removed from bundle. Run /rpiv-update-agents to sync." File is NOT deleted until command runs.

6. **User creates a custom agent in `.pi/agents/`**: not in manifest, never touched by sync. Survives both startup and command runs.

7. **Resolver verification**: after any sync, dispatching a named agent (e.g., `codebase-locator`) resolves correctly, does NOT fall back to `general-purpose`.

## File Map

```
extensions/rpiv-core/agents.ts                  # MODIFY — new types, manifest helpers, sync engine, compat wrapper
extensions/rpiv-core/index.ts                   # MODIFY — startup drift notice + command categorized summary
README.md                                       # MODIFY — updated agent-sync docs
.rpiv/guidance/agents/architecture.md           # MODIFY — updated sync behavior description
.rpiv/guidance/extensions/rpiv-core/architecture.md  # MODIFY — updated module structure
```

## Ordering Constraints

- Slices 1→2→3 are sequential (each depends on previous types/functions)
- Slice 4 (docs) can start after Slice 3 is approved but should be finalized last to reflect any late code changes

## Verification Notes

1. **First-session bootstrap**: delete `.pi/agents/` entirely, start session → all 9 agents copied, manifest written, notice shown. Check `ls .pi/agents/` for all 9 `.md` files + `.rpiv-managed.json`.
2. **User file preservation**: create `custom-agent.md` in `.pi/agents/`, run `/rpiv-update-agents` → `custom-agent.md` survives (not in manifest, not in bundled source).
3. **Stale removal**: add a fake entry to manifest (e.g., `"old-agent.md"`), ensure `old-agent.md` exists → run `/rpiv-update-agents` → `old-agent.md` removed, fake entry cleaned from manifest.
4. **Drift notice**: edit a managed agent file → start new session → notice appears with correct pending count → file NOT overwritten.
5. **Resolver regression**: after sync, run a skill that dispatches a named agent → verify it reports its correct type, not generic `general-purpose` behavior.
6. **Error resilience**: make `.pi/agents/` read-only → startup should NOT crash, errors should be collected silently.

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

## Pattern References

- `extensions/rpiv-core/git-context.ts:68-74` — changed/unchanged detection via signature comparison
- `scripts/migrate.js:214-231` — safe deletion pattern (delete after writes succeed, per-file try/catch)
- `extensions/rpiv-core/package-checks.ts:21-30` — JSON config read with fail-soft default (no local write precedent; apply same try/swallow posture to manifest writes)
- `extensions/rpiv-core/index.ts:203-239` — categorized result reporting (succeeded/failed buckets)
- `extensions/rpiv-core/guidance.ts:130-138` — catch-and-skip pattern for non-fatal startup operations

## Developer Context

**Q (`extensions/rpiv-core/agents.ts:49-57`, `pi-subagents/custom-agents.ts:37-54`): Which deletion policy for stale files?**
A: Remove only rpiv-managed bundled files; preserve user-created local-only files.

**Q (`extensions/rpiv-core/agents.ts:42-44`, `index.ts:62-67,128-130`): Missing bundled source posture?**
A: Silent no-op at session start, warning only on explicit `/rpiv-update-agents`.

**Q (design checkpoint): Manifest bootstrap — which files claimed as managed?**
A: Match by filename against current bundled source list. Deterministic, no historical state.

**Q (design checkpoint): When should updates be applied?**
A: Detect-only at startup (add new, but don't overwrite or remove). Apply all via `/rpiv-update-agents`.

**Q (design checkpoint): Should startup notify about drift?**
A: Yes — show a one-line notice when pending updates or removals detected.

## Design History

- Slice 1: types + manifest helpers — approved as generated
- Slice 2: core sync engine — approved as generated
- Slice 3: backward-compat wrapper + index.ts callers — approved as generated
- Slice 4: docs + guidance updates — approved as generated

## References

- Research artifact: `thoughts/shared/research/2026-04-14_10-45-44_subagent-sync-refactor.md`
- Questions artifact: `thoughts/shared/questions/2026-04-14_10-23-03_subagent-sync-refactor.md`
- Prior discovery: `thoughts/shared/questions/2026-04-13_15-53-01_agent-resolution-in-plugin.md`
- Migration-era design: `thoughts/shared/designs/2026-04-10_11-18-29_complete-pi-migration.md` (Decision 5)
