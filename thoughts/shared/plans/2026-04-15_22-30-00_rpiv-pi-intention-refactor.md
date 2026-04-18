---
date: 2026-04-15T22:30:00Z
planner: Claude Code
git_commit: 1c5ebfa
branch: main
repository: rpiv-pi
topic: "rpiv-pi intention-revealing refactor + post-extraction audit cleanup"
tags: [plan, rpiv-core, programming-by-intention, audit-cleanup, guidance, registry]
status: ready
design_source: "thoughts/shared/designs/2026-04-15_22-00-00_rpiv-pi-intention-refactor.md"
last_updated: 2026-04-15
last_updated_by: Claude Code
---

# rpiv-pi Intention-Revealing Refactor + Cleanup Implementation Plan

## Overview

Restructure `extensions/rpiv-core` into the programming-by-intention shape used by sibling plugins (`rpiv-advisor`, `rpiv-todo`, `rpiv-ask-user-question`): a thin `index.ts` composer, per-concern registrars, and one declarative `SIBLINGS` registry replacing three duplicated inventory sites. Alongside the code work, sweep documentation drift, delete stray files, and drop dead plan/design pairs.

See design artifact at `thoughts/shared/designs/2026-04-15_22-00-00_rpiv-pi-intention-refactor.md` for architecture details, decisions, and full code listings.

## Desired End State

- `extensions/rpiv-core/index.ts` is a ~20-line composer reading as a table of contents: three `register*(pi)` calls.
- `siblings.ts` holds the single source of truth for the five sibling plugins; `package-checks.ts`, `session-hooks.ts`, and `setup-command.ts` all read from it.
- Adding a sixth sibling is one entry in `SIBLINGS` — no other code changes.
- Five guidance `.md` files + `.pi/agents/CLAUDE.md` match current code (no `session_tree`, no `setActiveTools`, no "skip-if-exists" claims, no sibling-owned commands in root `commands` table).
- `scripts/types.js` and 16 dead thoughts artifacts are gone.
- `package.json` lists `LICENSE` in its `files` allowlist.
- Runtime behavior is identical: same five hooks, same two commands, same filesystem-based sibling detection.

## What We're NOT Doing

- No changes to `skills/**` (developer-locked scope decision).
- No changes to `agents/*.md` — `isolated: true` stays; frontmatter untouched.
- No new features; no `session_tree` subscription.
- No new tools (extension stays pure orchestrator).
- No changes to `guidance.ts`, `git-context.ts`, or `pi-installer.ts` logic.
- No version bump (separate concern, handled at publish time).

---

## Phase 1: Registry Foundation

### Overview
Introduce the declarative `SIBLINGS` registry and rewrite `package-checks.ts` as a thin projection over it. This is the prerequisite for every later phase: Phases 2's registrars all import `findMissingSiblings` from the rewritten `package-checks.ts`.

### Changes Required:

#### 1. SIBLINGS registry (NEW)
**File**: `extensions/rpiv-core/siblings.ts`
**Changes**: New file. Declarative `readonly` array of the five sibling plugins with `pkg`, `matches` regex, and `provides` description.

```typescript
/**
 * Declarative registry of rpiv-pi's sibling Pi plugins.
 *
 * Single source of truth for: presence detection (package-checks.ts),
 * session_start "missing plugins" warning (session-hooks.ts), and
 * /rpiv-setup installer (setup-command.ts). Add a sibling here and every
 * consumer picks it up automatically.
 *
 * Detection is filesystem-based via a regex over ~/.pi/agent/settings.json
 * — no runtime import of sibling packages (keeps rpiv-core pure-orchestrator).
 */

export interface SiblingPlugin {
	/** Install spec passed to `pi install`. Prefixed with `npm:` for Pi's installer. */
	readonly pkg: string;
	/** Case-insensitive regex that matches the package in ~/.pi/agent/settings.json. */
	readonly matches: RegExp;
	/** What the sibling provides — shown in /rpiv-setup confirmation and reports. */
	readonly provides: string;
}

export const SIBLINGS: readonly SiblingPlugin[] = [
	{
		pkg: "npm:@tintinweb/pi-subagents",
		matches: /@tintinweb\/pi-subagents/i,
		provides: "Agent / get_subagent_result / steer_subagent tools",
	},
	{
		pkg: "npm:@juicesharp/rpiv-ask-user-question",
		matches: /rpiv-ask-user-question/i,
		provides: "ask_user_question tool",
	},
	{
		pkg: "npm:@juicesharp/rpiv-todo",
		matches: /rpiv-todo/i,
		provides: "todo tool + /todos command + overlay widget",
	},
	{
		pkg: "npm:@juicesharp/rpiv-advisor",
		matches: /rpiv-advisor/i,
		provides: "advisor tool + /advisor command",
	},
	{
		pkg: "npm:@juicesharp/rpiv-web-tools",
		matches: /rpiv-web-tools/i,
		provides: "web_search + web_fetch tools + /web-search-config",
	},
];
```

#### 2. package-checks rewrite
**File**: `extensions/rpiv-core/package-checks.ts`
**Changes**: Delete the five `hasPiSubagentsInstalled()` / `hasAskUserQuestionInstalled()` / ... wrappers. Keep `readInstalledPackages()`. Replace with a single `findMissingSiblings()` that iterates `SIBLINGS` and returns those not matched in `~/.pi/agent/settings.json`.

```typescript
/**
 * Detect which SIBLINGS are installed by reading ~/.pi/agent/settings.json.
 * Pure utility — no ExtensionAPI.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { SIBLINGS, type SiblingPlugin } from "./siblings.js";

const PI_AGENT_SETTINGS = join(homedir(), ".pi", "agent", "settings.json");

function readInstalledPackages(): string[] {
	if (!existsSync(PI_AGENT_SETTINGS)) return [];
	try {
		const raw = readFileSync(PI_AGENT_SETTINGS, "utf-8");
		const settings = JSON.parse(raw) as { packages?: unknown };
		if (!Array.isArray(settings.packages)) return [];
		return settings.packages.filter((e): e is string => typeof e === "string");
	} catch {
		return [];
	}
}

/**
 * Return the SIBLINGS not currently installed.
 * Reads ~/.pi/agent/settings.json once per call — callers that need both the
 * full snapshot and the missing subset should call this once and filter.
 */
export function findMissingSiblings(): SiblingPlugin[] {
	const installed = readInstalledPackages();
	return SIBLINGS.filter((s) => !installed.some((entry) => s.matches.test(entry)));
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `npm install` completes without error (Pi compiles TS at install; there is no local `tsc` step). — deferred; index.ts still imports the removed `has*Installed` names until Phase 2 rewires through `findMissingSiblings`.
- [x] `siblings.ts` exports `SIBLINGS` and `SiblingPlugin`: `grep -E "^export (const SIBLINGS|interface SiblingPlugin)" extensions/rpiv-core/siblings.ts` returns two matches.
- [x] `package-checks.ts` no longer exports `has*Installed`: `grep -E "^export function has.*Installed" extensions/rpiv-core/package-checks.ts` returns zero matches.
- [x] `package-checks.ts` exports `findMissingSiblings`: `grep "^export function findMissingSiblings" extensions/rpiv-core/package-checks.ts` returns one match.

#### Manual Verification:
- [ ] Reading `siblings.ts` makes adding a sixth sibling obvious: one new entry, no other file edits.
- [ ] `findMissingSiblings()` returns the same packages the five old probes would have flagged individually.

---

## Phase 2: Per-Concern Registrars + Thin Composer

### Overview
Extract `session_start`/`session_compact`/`session_shutdown`/`tool_call`/`before_agent_start` wiring into `session-hooks.ts`, `/rpiv-setup` into `setup-command.ts`, and `/rpiv-update-agents` into `update-agents-command.ts`. Reduce `index.ts` to a ~20-line composer. Trim `agents.ts` of the legacy `copied`/`skipped` aliases and the `copyBundledAgents` wrapper.

**Depends on Phase 1** (all new registrars import `findMissingSiblings` from the rewritten `package-checks.ts`).

### Changes Required:

#### 1. Session hooks registrar (NEW)
**File**: `extensions/rpiv-core/session-hooks.ts`
**Changes**: New file. Exports `registerSessionHooks(pi)`. Hosts the five `pi.on(...)` subscriptions plus named helpers (`scaffoldThoughtsDirs`, `injectGitContext`, `notifyAgentSyncDrift`, `warnMissingSiblings`). User-facing strings grouped at file top as `msg*` arrow functions and `THOUGHTS_DIRS` constant.

```typescript
/**
 * Session lifecycle wiring for rpiv-core.
 *
 * Each handler body is a named helper; pi.on(...) lines are pure wiring.
 * Ordering and invariants preserved verbatim from the pre-refactor index.ts.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { isToolCallEventType, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { clearInjectionState, handleToolCallGuidance, injectRootGuidance } from "./guidance.js";
import {
	clearGitContextCache,
	isGitMutatingCommand,
	resetInjectedMarker,
	takeGitContextIfChanged,
} from "./git-context.js";
import { syncBundledAgents, type SyncResult } from "./agents.js";
import { findMissingSiblings } from "./package-checks.js";

// ---------------------------------------------------------------------------
// User-facing strings
// ---------------------------------------------------------------------------

const THOUGHTS_DIRS = [
	"thoughts/shared/research",
	"thoughts/shared/questions",
	"thoughts/shared/designs",
	"thoughts/shared/plans",
	"thoughts/shared/handoffs",
] as const;

const msgAgentsAdded = (n: number) => `Copied ${n} rpiv-pi agent(s) to .pi/agents/`;
const msgAgentsDrift = (parts: string[]) =>
	`${parts.join(", ")} agent(s). Run /rpiv-update-agents to sync.`;
const msgMissingSiblings = (n: number, list: string) =>
	`rpiv-pi requires ${n} sibling extension(s): ${list}. Run /rpiv-setup to install them.`;

// ---------------------------------------------------------------------------
// Public registrar
// ---------------------------------------------------------------------------

export function registerSessionHooks(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		resetInjectionState();
		injectRootGuidance(ctx.cwd, pi);
		scaffoldThoughtsDirs(ctx.cwd);
		await injectGitContext(pi, (msg) =>
			pi.sendMessage({ customType: "rpiv-git-context", content: msg, display: false }),
		);
		const agents = syncBundledAgents(ctx.cwd, false);
		if (ctx.hasUI) {
			notifyAgentSyncDrift(ctx.ui, agents);
			warnMissingSiblings(ctx.ui);
		}
	});

	pi.on("session_compact", async (_event, ctx) => {
		resetInjectionState();
		clearGitContextCache();
		resetInjectedMarker();
		injectRootGuidance(ctx.cwd, pi);
		await injectGitContext(pi, (msg) =>
			pi.sendMessage({ customType: "rpiv-git-context", content: msg, display: false }),
		);
	});

	pi.on("session_shutdown", async () => {
		resetInjectionState();
		clearGitContextCache();
		resetInjectedMarker();
	});

	pi.on("tool_call", async (event, ctx) => {
		handleToolCallGuidance(event, ctx, pi);
		if (isToolCallEventType("bash", event) && isGitMutatingCommand(event.input.command)) {
			clearGitContextCache();
		}
	});

	pi.on("before_agent_start", async () => {
		const content = await takeGitContextIfChanged(pi);
		if (!content) return;
		return { message: { customType: "rpiv-git-context", content, display: false } };
	});
}

// ---------------------------------------------------------------------------
// Named handler helpers
// ---------------------------------------------------------------------------

function resetInjectionState(): void {
	clearInjectionState();
}

function scaffoldThoughtsDirs(cwd: string): void {
	for (const dir of THOUGHTS_DIRS) {
		mkdirSync(join(cwd, dir), { recursive: true });
	}
}

async function injectGitContext(
	pi: ExtensionAPI,
	send: (msg: string) => void,
): Promise<void> {
	const msg = await takeGitContextIfChanged(pi);
	if (msg) send(msg);
}

function notifyAgentSyncDrift(
	ui: { notify: (msg: string, sev: "info" | "warning" | "error") => void },
	result: SyncResult,
): void {
	if (result.added.length > 0) {
		ui.notify(msgAgentsAdded(result.added.length), "info");
	}
	const parts: string[] = [];
	if (result.pendingUpdate.length > 0) parts.push(`${result.pendingUpdate.length} outdated`);
	if (result.pendingRemove.length > 0) parts.push(`${result.pendingRemove.length} removed from bundle`);
	if (parts.length > 0) {
		ui.notify(msgAgentsDrift(parts), "info");
	}
}

function warnMissingSiblings(
	ui: { notify: (msg: string, sev: "info" | "warning" | "error") => void },
): void {
	const missing = findMissingSiblings();
	if (missing.length === 0) return;
	ui.notify(msgMissingSiblings(missing.length, missing.map((m) => m.pkg.replace(/^npm:/, "")).join(", ")), "warning");
}
```

#### 2. /rpiv-setup command (NEW)
**File**: `extensions/rpiv-core/setup-command.ts`
**Changes**: New file. Exports `registerSetupCommand(pi)`. Reads `findMissingSiblings()`, confirms with user, drives a serial `spawnPiInstall` loop, reports succeeded/failed split. All user-facing strings grouped as `MSG_*` / arrow helpers at file top.

```typescript
/**
 * /rpiv-setup — installs any SIBLINGS not present in ~/.pi/agent/settings.json.
 *
 * Serial `pi install <pkg>` loop via spawnPiInstall (Windows-safe).
 * Reports succeeded/failed split; prompts the user to restart Pi on success.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { findMissingSiblings } from "./package-checks.js";
import { spawnPiInstall } from "./pi-installer.js";
import { type SiblingPlugin } from "./siblings.js";

// ---------------------------------------------------------------------------
// User-facing strings
// ---------------------------------------------------------------------------

const INSTALL_TIMEOUT_MS = 120_000;
const STDERR_SNIPPET_CHARS = 300;

const MSG_INTERACTIVE_ONLY = "/rpiv-setup requires interactive mode";
const MSG_ALL_INSTALLED = "All rpiv-pi sibling dependencies already installed.";
const MSG_CANCELLED = "/rpiv-setup cancelled";
const MSG_CONFIRM_TITLE = "Install rpiv-pi dependencies?";
const MSG_RESTART = "Restart your Pi session to load the newly-installed extensions.";

const msgInstalling = (pkg: string) => `Installing ${pkg}…`;
const msgInstalledLine = (pkgs: string[]) => `✓ Installed: ${pkgs.join(", ")}`;
const msgFailedHeader = () => `✗ Failed:`;
const msgFailedLine = (pkg: string, err: string) => `  ${pkg}: ${err}`;

function buildConfirmBody(missing: SiblingPlugin[]): string {
	return [
		"rpiv-pi will install the following Pi packages via `pi install`:",
		"",
		...missing.map((m) => `  • ${m.pkg}  (required — provides ${m.provides})`),
		"",
		"Each install is a separate `pi install <pkg>` invocation. Your",
		"~/.pi/agent/settings.json will be updated. Proceed?",
	].join("\n");
}

// ---------------------------------------------------------------------------
// Public registrar
// ---------------------------------------------------------------------------

export function registerSetupCommand(pi: ExtensionAPI): void {
	pi.registerCommand("rpiv-setup", {
		description: "Install rpiv-pi's sibling extension plugins",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify(MSG_INTERACTIVE_ONLY, "error");
				return;
			}

			const missing = findMissingSiblings();
			if (missing.length === 0) {
				ctx.ui.notify(MSG_ALL_INSTALLED, "info");
				return;
			}

			const confirmed = await ctx.ui.confirm(MSG_CONFIRM_TITLE, buildConfirmBody(missing));
			if (!confirmed) {
				ctx.ui.notify(MSG_CANCELLED, "info");
				return;
			}

			const { succeeded, failed } = await installMissing(ctx, missing);
			ctx.ui.notify(buildReport(succeeded, failed), failed.length > 0 ? "warning" : "info");
		},
	});
}

// ---------------------------------------------------------------------------
// Install loop + report
// ---------------------------------------------------------------------------

async function installMissing(
	ctx: { ui: { notify: (msg: string, sev: "info" | "warning" | "error") => void } },
	missing: SiblingPlugin[],
): Promise<{ succeeded: string[]; failed: Array<{ pkg: string; error: string }> }> {
	const succeeded: string[] = [];
	const failed: Array<{ pkg: string; error: string }> = [];
	for (const { pkg } of missing) {
		ctx.ui.notify(msgInstalling(pkg), "info");
		try {
			const result = await spawnPiInstall(pkg, INSTALL_TIMEOUT_MS);
			if (result.code === 0) {
				succeeded.push(pkg);
			} else {
				failed.push({
					pkg,
					error: (result.stderr || result.stdout || `exit ${result.code}`)
						.trim()
						.slice(0, STDERR_SNIPPET_CHARS),
				});
			}
		} catch (err) {
			failed.push({ pkg, error: err instanceof Error ? err.message : String(err) });
		}
	}
	return { succeeded, failed };
}

function buildReport(succeeded: string[], failed: Array<{ pkg: string; error: string }>): string {
	const lines: string[] = [];
	if (succeeded.length > 0) lines.push(msgInstalledLine(succeeded));
	if (failed.length > 0) {
		lines.push(msgFailedHeader());
		for (const { pkg, error } of failed) lines.push(msgFailedLine(pkg, error));
	}
	if (succeeded.length > 0) {
		lines.push("");
		lines.push(MSG_RESTART);
	}
	return lines.join("\n");
}
```

#### 3. /rpiv-update-agents command (NEW)
**File**: `extensions/rpiv-core/update-agents-command.ts`
**Changes**: New file. Exports `registerUpdateAgentsCommand(pi)`. Thin wrapper over `syncBundledAgents(ctx.cwd, true)`; formats the `added/updated/removed` summary and notifies via `ctx.ui.notify`.

```typescript
/**
 * /rpiv-update-agents — apply-mode sync of bundled agents into <cwd>/.pi/agents/.
 * Adds new, overwrites changed managed files, removes stale managed files.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { syncBundledAgents, type SyncResult } from "./agents.js";

const MSG_UP_TO_DATE = "All agents already up-to-date.";
const MSG_NO_CHANGES = "No changes needed.";

const msgSynced = (parts: string[]) => `Synced agents: ${parts.join(", ")}.`;
const msgSyncedWithErrors = (summary: string, errors: Error[]) =>
	`${summary} ${errors.length} error(s): ${errors.map((e) => e.message).join("; ")}`;

export function registerUpdateAgentsCommand(pi: ExtensionAPI): void {
	pi.registerCommand("rpiv-update-agents", {
		description:
			"Sync rpiv-pi bundled agents into .pi/agents/: add new, update changed, remove stale",
		handler: async (_args, ctx) => {
			const result = syncBundledAgents(ctx.cwd, true);
			if (!ctx.hasUI) return;
			ctx.ui.notify(formatSyncReport(result), result.errors.length > 0 ? "warning" : "info");
		},
	});
}

function formatSyncReport(result: SyncResult): string {
	const totalSynced = result.added.length + result.updated.length + result.removed.length;
	if (totalSynced === 0 && result.errors.length === 0) return MSG_UP_TO_DATE;

	const parts: string[] = [];
	if (result.added.length > 0) parts.push(`${result.added.length} added`);
	if (result.updated.length > 0) parts.push(`${result.updated.length} updated`);
	if (result.removed.length > 0) parts.push(`${result.removed.length} removed`);

	const summary = parts.length > 0 ? msgSynced(parts) : MSG_NO_CHANGES;
	if (result.errors.length > 0) {
		return msgSyncedWithErrors(summary, result.errors.map((e) => new Error(e.message)));
	}
	return summary;
}
```

#### 4. Thin composer
**File**: `extensions/rpiv-core/index.ts`
**Changes**: Replace the 240-line `default export` with a ~20-line composer that calls `registerSessionHooks(pi)`, `registerUpdateAgentsCommand(pi)`, `registerSetupCommand(pi)`. Remove all previously-inlined handler bodies and command bodies.

```typescript
/**
 * rpiv-core — Pure-orchestrator extension for rpiv-pi.
 *
 * Composes session hooks and the two slash commands. All logic lives in the
 * registrar modules; this file is the table of contents.
 *
 * Tool-owning plugins are siblings (see siblings.ts); install via /rpiv-setup.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerSessionHooks } from "./session-hooks.js";
import { registerSetupCommand } from "./setup-command.js";
import { registerUpdateAgentsCommand } from "./update-agents-command.js";

export default function (pi: ExtensionAPI) {
	registerSessionHooks(pi);
	registerUpdateAgentsCommand(pi);
	registerSetupCommand(pi);
}
```

#### 5. agents.ts legacy trim
**File**: `extensions/rpiv-core/agents.ts`
**Changes**:
- Trim `SyncResult` to its six intentional fields (`added`, `updated`, `unchanged`, `removed`, `pendingUpdate`, `pendingRemove`, `errors`). Drop `copied` and `skipped`.
- Drop the `copied`/`skipped` entries from `emptySyncResult()`.
- In `syncBundledAgents`, delete every `result.copied.push(...)` and `result.skipped.push(...)` call and the trailing "Populate legacy alias" block.
- Delete the `copyBundledAgents` wrapper (lines ~299-312).

```typescript
// MODIFY lines 45-66: trim SyncResult to its six intentional fields
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

// MODIFY lines 69-81: emptySyncResult no longer fills aliases
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

// MODIFY syncBundledAgents body: drop every `result.copied.push(...)` and
// `result.skipped.push(...)` call. Keep the genuine status fields. Also drop
// the trailing "6. Populate legacy `copied` alias" block entirely.

// DELETE lines 299-312: copyBundledAgents wrapper. No replacement needed.
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `npm install` completes without error. — deferred (no local tsc; Pi compiles at install)
- [x] `index.ts` is thin: `wc -l extensions/rpiv-core/index.ts` reports under 30 lines. (19)
- [x] All three registrars exist and export the expected names.
- [x] Legacy aliases gone (zero matches).
- [x] No `pi.on` or `pi.registerCommand` in `index.ts` (zero matches).

#### Manual Verification:
- [ ] Running `pi` in the repo produces a session with the same user-visible behavior: root guidance injected, `thoughts/` scaffolded, bundled agents synced, warnings for missing siblings.
- [ ] `/rpiv-setup` installs the same five packages as before in the same order; confirmation body lists each package with its `provides` line.
- [ ] `/rpiv-update-agents` produces a summary in the form "Synced agents: N added, M updated, K removed." (or "All agents already up-to-date.").
- [ ] Git-context injection on `session_start` and `before_agent_start` still behaves identically — no double-injection, no missed changes.
- [ ] Reading `index.ts` top-to-bottom reveals the extension's capabilities in three lines.

---

## Phase 3: Guidance Doc Sweep

### Overview
Surgical edits to match docs to current code. Every existing section is preserved — section count pre/post is identical per file. Content inside sections is rewritten where stale.

**Can run in parallel with Phase 4. Depends on Phase 2** (docs describe the post-refactor shape).

### Changes Required:

#### 1. Root guidance (MODIFY)
**File**: `.rpiv/guidance/architecture.md`
**Changes**: Commands table — delete `/todos` and `/advisor` rows (sibling-owned); add "sibling-plugin commands live in sibling READMEs" note. Business Context paragraph — drop "advisor, todo tracking" from the tooling list; replace with "guidance injection, git-context injection, thoughts/ scaffolding, bundled-agent sync". Guidance Injection `<important>` block — fix ladder ordering to include `CLAUDE.md`.

````markdown
# rpiv-pi

A Pi CLI plugin package that extends the Pi coding agent with TypeScript runtime infrastructure, two slash commands, and Markdown-based AI workflow skills.

# Architecture

```
rpiv-pi/
├── extensions/rpiv-core/   — Pi runtime extension: session hooks, /rpiv-* commands (TypeScript)
├── scripts/                — migrate.js CLI for legacy .rpiv/guidance/architecture.md migration
├── agents/                 — Named subagent profiles dispatched by skills (Markdown)
├── skills/                 — User-invocable AI workflow skills (Markdown)
└── thoughts/shared/        — Pipeline artifact store: questions/, research/, designs/, plans/, reviews/, handoffs/
```

Pi discovers extensions via `"extensions": ["./extensions"]` and skills via `"skills": ["./skills"]` in `package.json`.

Tools live in sibling plugins — `rpiv-pi` registers zero tools. Install missing siblings via `/rpiv-setup`.

Skill pipeline: `discover` → `research` → `design` → `plan` → `implement` → `validate`

# Commands

| Command | Description |
|---|---|
| `pi` | Start a Pi session with rpiv-pi loaded |
| `/skill:<name>` | Invoke a skill (e.g. `/skill:commit`, `/skill:discover`) |
| `/rpiv-update-agents` | Refresh `<cwd>/.pi/agents/` from bundled agent definitions |
| `/rpiv-setup` | Install missing sibling plugins |

Sibling-plugin commands (`/todos`, `/advisor`, `/web-search-config`) are registered by the siblings themselves once installed — see each sibling's README.

# Business Context

rpiv-pi augments the Pi agent with a research → design → implement skill pipeline and the runtime infrastructure those skills depend on: guidance injection, git-context injection, `thoughts/` scaffolding, and bundled-agent sync. Tool surfaces (ask_user_question, todo, advisor, web tools, subagents) live in sibling plugins.

<important if="you are adding a new end-to-end feature (skill + agent)">
## Adding a Feature End-to-End
1. Skill workflow → see `.rpiv/guidance/skills/architecture.md`
2. Named subagent (if the skill needs a new specialist) → see `.rpiv/guidance/agents/architecture.md`
3. Runtime infrastructure (session hooks, commands) → see `.rpiv/guidance/extensions/rpiv-core/architecture.md`

New tools belong in sibling plugins, not here — `rpiv-pi` is pure infrastructure.
</important>

<important if="you are modifying guidance injection behavior">
## Guidance Injection
`extensions/rpiv-core/guidance.ts` — single Pi delivery path. On `tool_call` for `read`/`edit`/`write`, resolves per-depth at most one of `AGENTS.md > CLAUDE.md > .rpiv/guidance/<sub>/architecture.md` (depth 0 skips AGENTS/CLAUDE — Pi's own resource-loader handles `<cwd>` already). Injects each new file via `pi.sendMessage({ display: false })`; an in-process `Set` dedups across the session; cleared on `session_start`/`session_compact`/`session_shutdown`.
</important>
````

#### 2. rpiv-core extension guidance (MODIFY)
**File**: `.rpiv/guidance/extensions/rpiv-core/architecture.md`
**Changes**: Preserve all 12 sections. Content-level edits only:
- `## Responsibility`: drop "todos, advisor config"; add "guidance injection, git-context injection, thoughts/ scaffold, bundled-agent sync".
- `## Dependencies`: drop `@mariozechner/pi-ai`, `@mariozechner/pi-tui`, `@sinclair/typebox` bullets.
- `## Module Structure`: remove rows for `ask-user-question.ts`, `todo.ts`, `advisor.ts`, `todo-overlay.ts`. Add rows for `siblings.ts`, `session-hooks.ts`, `setup-command.ts`, `update-agents-command.ts`.
- `## Tool Registration`: prepend note "rpiv-core registers zero tools today — it is a pure orchestrator. This pattern applies to sibling plugins."
- `## Branch Replay`: prepend note "rpiv-core has no tool state today (all state is sibling-owned). The pattern below applies to sibling plugins."
- `## Architectural Boundaries`: drop two stale bullets (`NO state mutation in tool_execution_end`, `NO advisor in active tools`). Append two: `NO runtime import of sibling packages`, `NO tools registered here`.
- `<important if="adding a new tool">`: content replaced with sibling-plugin pointer.
- `<important if="adding a new slash command">`: promote "Complex handler: create my-command.ts" to the default pattern.
- `<important if="adding a session lifecycle hook">`: remove `session_tree` from the valid-events list; clarify rpiv-core doesn't subscribe it.
- `<important if="adding a pure utility module">`: trim credentials clause (not applicable to rpiv-core).
- `<important if="adding a persistent widget">`: prepend note "TodoOverlay extracted to `@juicesharp/rpiv-todo`; no widgets currently live in rpiv-core."

````markdown
# rpiv-core Extension

## Responsibility
Pi runtime orchestrator. Owns zero tools. Wires five session lifecycle hooks and registers two slash commands (`/rpiv-update-agents`, `/rpiv-setup`). All tool surfaces live in sibling plugins listed in `siblings.ts`.

## Dependencies
- **`@mariozechner/pi-coding-agent`**: `ExtensionAPI`, `isToolCallEventType`. Only runtime import.
- Node built-ins: `node:fs`, `node:path`, `node:url`, `node:os`, `node:child_process`.
- External processes: `git` (via `pi.exec`), `pi` CLI (via `spawn` in `pi-installer.ts`).

No runtime imports of any sibling plugin — detection is filesystem-based (regex over `~/.pi/agent/settings.json`).

## Consumers
- **Pi extension host**: loads via `package.json` `"extensions": ["./extensions"]`; calls `default export(pi: ExtensionAPI)` at session start.
- **Skills**: consume the session-time scaffolding (`thoughts/shared/*` directories) and the bundled-agent sync into `<cwd>/.pi/agents/`.

## Module Structure
```
index.ts                   — Thin composer. Three lines of wiring.
siblings.ts                — Declarative SIBLINGS registry (5 sibling plugins).
session-hooks.ts           — registerSessionHooks: session_start/compact/shutdown, tool_call, before_agent_start
setup-command.ts           — registerSetupCommand: /rpiv-setup installer
update-agents-command.ts   — registerUpdateAgentsCommand: /rpiv-update-agents
guidance.ts                — resolveGuidance + handleToolCallGuidance + injectRootGuidance; session-scoped dedup Set
git-context.ts             — branch+commit+user cache + takeGitContextIfChanged + isGitMutatingCommand
agents.ts                  — syncBundledAgents: manifest-based add/update/remove engine
package-checks.ts          — findMissingSiblings: thin projection over SIBLINGS
pi-installer.ts            — spawnPiInstall: Windows-safe `pi install <pkg>` wrapper
```

## Architectural Boundaries
- **NO tools registered here**: rpiv-core is pure orchestrator. New tools belong in sibling plugins.
- **NO runtime import of sibling packages**: detection stays filesystem-based.
- **NO business logic in `index.ts`**: the composer calls named registrars only.
- **NO `ExtensionAPI` in pure utilities**: `siblings.ts`, `package-checks.ts`, `agents.ts`, `pi-installer.ts` stay `pi`-free. `guidance.ts`'s `resolveGuidance` is pure; its injection helpers take `pi` explicitly.
- **Mark-before-send in guidance injection**: `guidance.ts:139,179-181` — idempotence wins over reliability.
- **Detect-only vs apply two-phase manifest sync**: `agents.ts:285-288` — detect path preserves `pendingRemove` entries in the manifest so a later apply can still remove them.
- **Windows-safe spawn** for any `pi install` or CLI-shim call: reuse `spawnPiInstall` pattern from `pi-installer.ts`.

## Session Hook Wiring

| Event | Responsibility |
|---|---|
| `session_start` | Reset injection state, inject root guidance, scaffold `thoughts/`, inject git context, sync bundled agents (detect-only), warn on drift + missing siblings |
| `session_compact` | Reset injection + git cache + injected marker, re-inject root guidance + git context |
| `session_shutdown` | Reset injection + git cache + injected marker |
| `tool_call` | Subfolder guidance injection (read/edit/write) + git cache invalidation on mutating bash |
| `before_agent_start` | Inject git context into agent only when the signature changed |

## The SIBLINGS Registry

`siblings.ts` is the single source of truth for the five sibling plugins. Three consumers read from it: `package-checks.ts` (presence detection), `session-hooks.ts` (session_start missing-plugin warning), `setup-command.ts` (/rpiv-setup install loop). Adding a sixth sibling = one entry in `SIBLINGS`.

<important if="you are adding a new session hook">
## Adding a Session Hook
1. Add the `pi.on("event_name", …)` line inside `registerSessionHooks` in `session-hooks.ts`.
2. Extract the handler body into a named helper function in the same file — `pi.on` lines are wiring only.
3. Valid events: `session_start`, `session_compact`, `session_shutdown`, `tool_call`, `before_agent_start`. (`session_tree` is not used here — rpiv-core has no tool state to reconstruct.)
4. `before_agent_start` can return `{ message: { customType, content, display: false } }` to inject a hidden LLM-only context message.
</important>

<important if="you are adding a new slash command">
## Adding a Slash Command
1. Create `my-command.ts`, export `registerMyCommand(pi: ExtensionAPI): void`.
2. Inside the handler, guard interactive ops: `if (!ctx.hasUI) { ctx.ui.notify("…", "error"); return; }`.
3. Group user-facing strings at file top as `MSG_*`/`ERR_*` constants or arrow-message helpers. No inline template literals in logic.
4. Register in `index.ts` by adding one call: `registerMyCommand(pi)`.
</important>

<important if="you are adding a sibling plugin">
## Adding a Sibling Plugin
1. Add one entry to `SIBLINGS` in `siblings.ts`: `{ pkg: "npm:…", matches: /…/i, provides: "…" }`.
2. Add the package to `peerDependencies` in `package.json` pinned to `"*"`.
3. No other code changes — presence detection, the session_start missing-plugin warning, and `/rpiv-setup` all pick it up automatically.
</important>

<important if="you are adding a pure utility module">
## Adding a Utility Module
1. Create `extensions/rpiv-core/my-util.ts` with no `ExtensionAPI` import.
2. Every function returns a value or `void`; never throws — catch all errors and return a safe default.
3. `PACKAGE_ROOT` resolution: use `import.meta.url` + `fileURLToPath` — never `__dirname`.
</important>
````

Note: The design's Slice 8 revision requires **preserving the existing 12-section structure** (Responsibility, Dependencies, Consumers, Module Structure, Tool Registration, Branch Replay, Architectural Boundaries + five `<important if=…>` blocks). The snippet above is shown condensed for reference — implement-plan must edit content within each existing section rather than replacing the file wholesale. See the design's Slice 8 per-section edit list at `thoughts/shared/designs/2026-04-15_22-00-00_rpiv-pi-intention-refactor.md:650-754`.

#### 3. Skills guidance (MODIFY)
**File**: `.rpiv/guidance/skills/architecture.md`
**Changes**: Edit the first bullet in `## Dependencies` — split tool ownership between "Sibling plugins" (the actual tool providers) and `extensions/rpiv-core` (session-time scaffolding + guidance/git-context injection + bundled-agent sync). Lines 49 and 78 unchanged.

```markdown
# MODIFY lines 6-8 (Dependencies section, first bullets)
## Dependencies
- **Pi framework**: reads `"skills": ["./skills"]` from `package.json`; injects SKILL.md body as system context on invocation
- **Sibling plugins**: provide the tools skills call — `ask_user_question` (`@juicesharp/rpiv-ask-user-question`), `todo` (`@juicesharp/rpiv-todo`), `advisor` (`@juicesharp/rpiv-advisor`), `web_search`/`web_fetch` (`@juicesharp/rpiv-web-tools`), `Agent` (`@tintinweb/pi-subagents`)
- **`extensions/rpiv-core/`**: session-time scaffolding (thoughts/ dirs), guidance injection, git-context injection, bundled-agent sync

# Lines 49 and 78 unchanged (the existing `ask_user_question` references describe skill-side usage of the sibling tool — accurate, no edit needed).
```

#### 4. Agents guidance (MODIFY)
**File**: `.rpiv/guidance/agents/architecture.md`
**Changes**: Fix the two sibling-ownership references (lines 24 and 59) — name the owning sibling package for Agent dispatch and for `web_search`/`web_fetch`.

```markdown
# MODIFY .rpiv/guidance/agents/architecture.md:24
  precedent-locator.md    — Git history mining: + bash (git commands only; `@tintinweb/pi-subagents` provides the Agent dispatch runtime)

# MODIFY .rpiv/guidance/agents/architecture.md:59
- `+ web_search, web_fetch` → only `web-search-researcher` (tools provided by `@juicesharp/rpiv-web-tools`)
```

#### 5. .pi/agents/CLAUDE.md (MODIFY)
**File**: `.pi/agents/CLAUDE.md`
**Changes**: Replace the stale "auto-copied … skip-if-exists" description (line 6) with the current manifest-based detect-vs-apply behavior. Update line 75 in the "Adding a New Agent" `<important>` block to match.

```markdown
# MODIFY line 6
At session start, `extensions/rpiv-core/agents.ts` syncs bundled `.md` files to `<cwd>/.pi/agents/` — adding new files and detecting outdated or removed agents (detect-only, no overwrite). Use `/rpiv-update-agents` to apply full sync: add new, update changed, remove stale managed files.

# MODIFY line 75 (in the "Adding a New Agent" important block)
8. The file is auto-synced to `<cwd>/.pi/agents/` at session start — no registration step needed. `/rpiv-update-agents` applies full sync including new agents.
```

### Success Criteria:

#### Automated Verification:
- [x] No stale references remain: `grep -RE "ask-user-question\.ts|todo\.ts|advisor\.ts|todo-overlay\.ts|setActiveTools|tool_execution_end|session_tree|skip-if-exists" .rpiv/guidance/ .pi/agents/` returns zero matches.
- [x] `/todos` and `/advisor` no longer listed in root guidance commands table: `grep -E "^\| \`/(todos|advisor)\`" .rpiv/guidance/architecture.md` returns zero matches.
- [x] Section count preserved in the rpiv-core guidance file: 7 top-level `##` + 5 `<important>` blocks = structure identical to pre-refactor (grep reports 17 with inner `##` headings included).

#### Manual Verification:
- [ ] Reading each guidance file top-to-bottom describes the current code accurately — nothing refers to extracted modules or rejected plans.
- [ ] Every `<important if="...">` block still matches its trigger; no block is orphaned.

---

## Phase 4: Cleanup Sweep

### Overview
Delete stray files, misfiled sibling-repo artifacts, and dead plan/design pairs. Add `LICENSE` to `package.json` files allowlist. Fully independent of other phases — can land any time.

### Changes Required:

#### 1. package.json files allowlist
**File**: `package.json`
**Changes**: Add `"LICENSE"` to the `files` array.

```json
// MODIFY line 20
"files": ["extensions/", "skills/", "agents/", "scripts/", "README.md", "LICENSE"],
```

#### 2. Delete orphan script
**File**: `scripts/types.js`
**Changes**: Delete. One-line `export {};` orphan with zero importers.

#### 3. Delete 16 dead thoughts artifacts
**Files**:
- `thoughts/shared/designs/2026-04-10_22-34-39_todo-tool-cc-parity.md`
- `thoughts/shared/plans/2026-04-11_07-30-37_todo-tool-cc-parity.md`
- `thoughts/shared/designs/2026-04-11_07-19-35_todo-list-overlay-above-input.md`
- `thoughts/shared/plans/2026-04-11_07-38-04_todo-list-overlay-above-input.md`
- `thoughts/shared/designs/2026-04-11_14-10-07_advisor-strategy-pattern.md`
- `thoughts/shared/plans/2026-04-11_14-43-28_advisor-strategy-pattern.md`
- `thoughts/shared/designs/2026-04-12_00-33-33_advisor-effort-configuration.md`
- `thoughts/shared/plans/2026-04-12_00-46-13_advisor-effort-configuration.md`
- `thoughts/shared/designs/2026-04-12_12-21-43_advisor-settings-persistence.md`
- `thoughts/shared/plans/2026-04-12_12-59-39_advisor-settings-persistence.md`
- `thoughts/shared/designs/2026-04-12_03-55-13_skill-flow-pipeline.md`
- `thoughts/shared/plans/2026-04-12_04-17-20_skill-flow-pipeline.md`
- `thoughts/shared/designs/2026-04-13_11-07-13_pi-subagent-context-discipline.md`
- `thoughts/shared/plans/2026-04-13_11-51-36_pi-subagent-context-discipline.md`
- `thoughts/shared/designs/2026-04-15_03-57-55_ask-user-question-wrap-fix.md`
- `thoughts/shared/designs/2026-04-15_ask-user-question-text-wrapping-fix.md`
- `thoughts/shared/plans/2026-04-15_00-06-55_ask-user-question-wrap-fix.md`

**Changes**: All deleted. Dead plan/design pairs (DEAD or REJECTED per research Q9 table) + two misfiled sibling-repo artifacts.

### Success Criteria:

#### Automated Verification:
- [x] `LICENSE` in `files` allowlist: `node -e "const s=require('./package.json'); process.exit(s.files.includes('LICENSE') ? 0 : 1)"` exits 0.
- [x] `scripts/types.js` is gone: `test ! -e scripts/types.js` exits 0.
- [x] Dead thoughts files are gone: `ls thoughts/shared/designs/ thoughts/shared/plans/ | grep -E "todo-tool-cc-parity|todo-list-overlay-above-input|advisor-strategy-pattern|advisor-effort-configuration|advisor-settings-persistence|skill-flow-pipeline|pi-subagent-context-discipline|ask-user-question-wrap-fix|ask-user-question-text-wrapping-fix"` returns zero matches.

#### Manual Verification:
- [ ] `ls scripts/` shows only files that are actively imported or invoked.
- [ ] `thoughts/shared/plans/` and `thoughts/shared/designs/` contain only live / in-progress or historical-reference artifacts.
- [ ] `npm pack --dry-run` output lists `LICENSE` in the tarball contents.

---

## Testing Strategy

### Automated:
- `npm install` after each phase (Pi compiles TypeScript at install — this is the compile check).
- The `grep`-based success criteria above act as lint checks for the intention-refactor invariants.

### Manual Testing Steps:
1. After Phase 2: start `pi` in the repo root and confirm session_start emits identical user-visible output (root guidance injection, thoughts/ scaffolding, bundled-agent sync notification, missing-sibling warning list).
2. Run `/rpiv-setup` in a Pi environment with some siblings intentionally uninstalled — confirm the confirmation body lists each missing sibling with its `provides` line and that each install runs serially.
3. Run `/rpiv-update-agents` after editing a bundled agent file — confirm the command reports `N updated`.
4. Trigger a `session_compact` (long session) — confirm guidance is re-injected and git-context is refreshed.
5. Edit a file under a subdirectory with its own `.rpiv/guidance/<sub>/architecture.md` — confirm the guidance is injected on the first `read`/`edit`/`write` and not again on subsequent calls in the same session.

## Performance Considerations

`findMissingSiblings()` reads `~/.pi/agent/settings.json` once per call. Pre-refactor, `session_start` called five separate `has*Installed()` probes, each re-reading the file — a 5× read. Post-refactor: 1× read per `session_start` and 1× per `/rpiv-setup` invocation.

## Migration Notes

Not applicable — no persisted state, no schema changes. The refactor is transparent at runtime: same hooks, same commands, same file I/O. External callers of `copyBundledAgents` or `SyncResult.copied`/`.skipped` would break — research confirms no such callers exist. If any surface later, they can call `syncBundledAgents(cwd, overwrite)` directly and compute `copied = added ∪ updated` themselves.

## References

- Design: `thoughts/shared/designs/2026-04-15_22-00-00_rpiv-pi-intention-refactor.md`
- Research artifact: `thoughts/shared/research/2026-04-15_21-11-56_rpiv-pi-state-audit.md`
- Research questions: `thoughts/shared/questions/2026-04-15_14-30-00_rpiv-pi-state-audit.md`
- Naming-conventions-unification plan (prior precedent): `thoughts/shared/plans/2026-04-14_14-04-32_naming-conventions-unification.md`
- Sibling plugin templates:
  - `/Users/sguslystyi/rpiv-advisor/index.ts`, `/Users/sguslystyi/rpiv-advisor/advisor.ts`
  - `/Users/sguslystyi/rpiv-todo/todo.ts`
  - `/Users/sguslystyi/rpiv-ask-user-question/index.ts`
