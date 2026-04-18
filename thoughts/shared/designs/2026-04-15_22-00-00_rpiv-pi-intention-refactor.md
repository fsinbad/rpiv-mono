---
date: 2026-04-15T22:00:00Z
designer: Claude Code
git_commit: 1c5ebfa
branch: main
repository: rpiv-pi
topic: "rpiv-pi intention-revealing refactor + post-extraction audit cleanup"
tags: [design, refactor, rpiv-core, programming-by-intention, audit-cleanup, guidance, registry]
status: complete
research_source: thoughts/shared/research/2026-04-15_21-11-56_rpiv-pi-state-audit.md
last_updated: 2026-04-15
last_updated_by: Claude Code
---

# Design: rpiv-pi Intention-Revealing Refactor + Cleanup

## Summary

Restructure `extensions/rpiv-core` in the programming-by-intention shape already adopted by sibling plugins (`rpiv-advisor`, `rpiv-todo`, `rpiv-ask-user-question`): a thin `index.ts` composer that reads as a table of contents, per-concern registrars in their own files, and one declarative `SIBLINGS` registry that unifies the three places currently carrying the sibling-plugin inventory. Alongside the structural work, sweep the documentation drift identified in the audit, remove stray files, and delete the plan/design pairs for work already done or rejected.

## Requirements

- Post-extraction, `extensions/rpiv-core` reads like the sibling plugins: thin entry, named registrars, declarative registries.
- One source of truth for the sibling-plugin inventory (name, detection regex, setup reason).
- Guidance documentation matches current code — every stale reference from research Q2 gone.
- Stray files (`scripts/types.js`) and misfiled sibling-repo artifacts are removed.
- `isolated: true` on `agents/*.md` is preserved (intentional, not residue).
- `skills/` bodies are not modified (explicit out-of-scope).

## Current State Analysis

### Key Discoveries

- `extensions/rpiv-core/index.ts:37-275` — single 240-line `default export` function with five `pi.on` handlers and two `pi.registerCommand` bodies inlined.
- `extensions/rpiv-core/package-checks.ts:33-50` — five `has*Installed()` functions, each a one-liner with a different regex over the same `readInstalledPackages()` source.
- `extensions/rpiv-core/index.ts:89-94,183-212` — the same five-sibling inventory is declared twice inline.
- Sibling pattern templates:
  - `/Users/sguslystyi/rpiv-advisor/index.ts:20-28` — canonical thin composer.
  - `/Users/sguslystyi/rpiv-advisor/advisor.ts:76-90` — `MSG_*`/`ERR_*` string constants grouped by concern.
  - `/Users/sguslystyi/rpiv-todo/todo.ts:60-65` — declarative `Record` tables replacing switch/if dispatch.
- `extensions/rpiv-core/agents.ts:62-65,307-312` — `copied`/`skipped` aliases + `copyBundledAgents` wrapper are self-referenced only.
- Research Q2 inventory lists ~20 stale references across five guidance files.

### Constraints

- No runtime import of sibling packages allowed — detection stays filesystem-based (`readInstalledPackages()` reading `~/.pi/agent/settings.json`).
- Pi hook contract unchanged — same five events (`session_start`, `session_compact`, `session_shutdown`, `tool_call`, `before_agent_start`) + same two commands.
- Mark-before-send ordering in `guidance.ts` is load-bearing (preserved as-is).
- Windows-safe `spawn` in `pi-installer.ts` is load-bearing (preserved as-is).

## Scope

### Building

- `extensions/rpiv-core/siblings.ts` — new declarative `SIBLINGS` registry.
- `extensions/rpiv-core/package-checks.ts` — rewritten as thin projection over `SIBLINGS`.
- `extensions/rpiv-core/session-hooks.ts` — `registerSessionHooks(pi)` extracted from `index.ts`.
- `extensions/rpiv-core/setup-command.ts` — `registerSetupCommand(pi)` extracted from `index.ts`.
- `extensions/rpiv-core/update-agents-command.ts` — `registerUpdateAgentsCommand(pi)` extracted from `index.ts`.
- `extensions/rpiv-core/index.ts` — thin composer (~20 lines).
- `extensions/rpiv-core/agents.ts` — legacy aliases + wrapper removed.
- Five guidance docs rewritten to match current code.
- `package.json` — `LICENSE` added to `files` allowlist.
- Stray files deleted (`scripts/types.js`) + misfiled + dead-plan cleanup (16 thoughts artifacts).

### Not Building

- No changes to `skills/**` (developer-locked scope decision).
- No changes to `agents/*.md` — `isolated: true` stays; frontmatter untouched.
- No new features, no `session_tree` subscription (doc is the thing out of sync, not the code).
- No new tools (extension stays pure infrastructure).
- No changes to `guidance.ts`, `git-context.ts`, `pi-installer.ts` logic — these already read intention-first.
- No version bump (separate concern; covered by a later commit when published).

## Decisions

### Decision 1: Unify sibling-plugin inventory into one declarative registry
- **Ambiguity**: three places carry the same five-sibling list — `package-checks.ts:33-50`, `index.ts:89-94`, `index.ts:183-212`.
- **Explored**:
  - Option A: single `SIBLINGS` array (`{pkg, matches, warningReason, setupReason}`) in `siblings.ts`, consumed by all three sites.
  - Option B: registry + keep named `has*Installed()` wrappers.
  - Option C: dedupe inline lists only; leave `package-checks.ts` 5-function shape.
- **Decision**: Option A. Single source of truth; adding a 6th sibling is one entry. Matches sibling-plugin declarative style (`rpiv-todo/todo.ts:60-65`).

### Decision 2: Split `index.ts` into per-concern registrars
- **Ambiguity**: `index.ts` is 240 lines; sibling pattern is <30 lines.
- **Explored**:
  - Option A: per-concern files (`session-hooks.ts`, `setup-command.ts`, `update-agents-command.ts`).
  - Option B: extract to top-level named functions, keep in `index.ts`.
  - Option C: hybrid — extract only `/rpiv-setup`.
- **Decision**: Option A. Matches `rpiv-advisor/index.ts:20-28` exactly; each file owns one concern, `index.ts` reads as a table of contents.

### Decision 3: Drop `session_tree` doc claim; do not subscribe
- **Evidence**: `extensions/rpiv-core/index.ts:124-138` wires only `session_start`/`session_compact`/`session_shutdown`/`tool_call`/`before_agent_start`. No tool state in `rpiv-core` needs tree-time reconstruction (todo/advisor state is sibling-owned).
- **Decision**: Remove the `session_tree` claim from `.rpiv/guidance/extensions/rpiv-core/architecture.md:98`. Do not subscribe the hook.

### Decision 4: Remove legacy `SyncResult` aliases and `copyBundledAgents` wrapper
- **Evidence**: `agents.ts:62-65` exposes `copied`/`skipped`; `agents.ts:307-312` is the only caller of those via the wrapper. Research confirms no external callers in repo.
- **Decision**: Drop both. `SyncResult` becomes smaller and self-describing. `syncBundledAgents` is the single entry.

### Decision 5: Preserve `isolated: true` on agents
- **Evidence**: developer confirmed during checkpoint — intentional, not residue from the rejected `pi-subagent-context-discipline` plan.
- **Decision**: Leave all nine `agents/*.md` frontmatter untouched. The research Q9 row that classified this as "stale residue" is a bug in the inherited research artifact; corrected in this design.

### Decision 6: Sweep stray artifacts
- **Evidence**: research Q10 + Q9.
- **Decision**: Delete `scripts/types.js` (zero importers). Delete 16 thoughts artifacts (8 dead-in-repo plan/design pairs for todo-tool, todo-overlay, advisor-strategy, advisor-effort, advisor-settings, skill-flow-pipeline, subagent-context-discipline — DEAD or REJECTED per research table; plus 2 misfiled sibling-repo artifacts for `ask-user-question-wrap-fix`). Add `LICENSE` to `package.json:20` files allowlist.

### Decision 7: Extract user-facing strings into named constants
- **Evidence**: sibling pattern at `rpiv-advisor/advisor.ts:76-90` — `MSG_*`/`ERR_*` / `errXxx(…)=>` / `msgXxx(…)=>` so user-facing text is grouped at file top, never scattered through logic.
- **Decision**: Apply in each new file. Strings that are parameterized become arrow functions; static strings become `const`.

## Architecture

### extensions/rpiv-core/siblings.ts — NEW

Declarative registry of the five sibling plugins. Every sibling-plugin consumer in this extension reads from this single source.

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

### extensions/rpiv-core/package-checks.ts — MODIFY

Thin projection over `SIBLINGS`. The five `has*Installed()` functions disappear — they were never intentional; callers iterate the registry directly.

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

### extensions/rpiv-core/session-hooks.ts — NEW

Owns the four lifecycle hooks (`session_start`, `session_compact`, `session_shutdown`, `tool_call`, `before_agent_start`). Each handler body is a named helper so the `pi.on(…)` lines read as wiring, not logic.

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

### extensions/rpiv-core/setup-command.ts — NEW

Owns `/rpiv-setup`. Reads the `SIBLINGS` registry via `findMissingSiblings()` and drives the installer loop.

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

### extensions/rpiv-core/update-agents-command.ts — NEW

Owns `/rpiv-update-agents`. Thin wrapper over `syncBundledAgents(cwd, true)`.

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

### extensions/rpiv-core/index.ts — MODIFY

Becomes a ~20-line composer. Each line reads as a wiring statement.

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

### extensions/rpiv-core/agents.ts — MODIFY

Remove `copied`/`skipped` from `SyncResult`, remove their populate sites, remove the `copyBundledAgents` back-compat wrapper.

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

### .rpiv/guidance/architecture.md — MODIFY (surgical)

Preserve all existing section headings. Surgical edits within sections:
- Commands table: delete only the `/todos` and `/advisor` rows (sibling-owned).
- Business Context paragraph: edit the tooling list — drop "advisor, todo tracking".
- Ladder description in the "Guidance Injection" `<important>` block: fix the ordering (include `CLAUDE.md`).

No section added. No section removed.

```markdown
# rpiv-pi

A Pi CLI plugin package that extends the Pi coding agent with TypeScript runtime infrastructure, two slash commands, and Markdown-based AI workflow skills.

# Architecture

\`\`\`
rpiv-pi/
├── extensions/rpiv-core/   — Pi runtime extension: session hooks, /rpiv-* commands (TypeScript)
├── scripts/                — migrate.js CLI for legacy .rpiv/guidance/architecture.md migration
├── agents/                 — Named subagent profiles dispatched by skills (Markdown)
├── skills/                 — User-invocable AI workflow skills (Markdown)
└── thoughts/shared/        — Pipeline artifact store: questions/, research/, designs/, plans/, reviews/, handoffs/
\`\`\`

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
```

### .rpiv/guidance/extensions/rpiv-core/architecture.md — MODIFY (surgical)

Preserve all 12 existing sections (`Responsibility`, `Dependencies`, `Consumers`, `Module Structure`, `Tool Registration`, `Branch Replay`, `Architectural Boundaries`, + 5 `<important if="…">` blocks). Edit content within each section only.

Per-section surgical edits:

- **`## Responsibility`**: drop the "todos, advisor config" phrase; replace with "guidance injection, git-context injection, thoughts/ scaffold, bundled-agent sync".
- **`## Dependencies`**: drop `@mariozechner/pi-ai`, `@mariozechner/pi-tui`, `@sinclair/typebox` bullets (no longer runtime imports); keep `@mariozechner/pi-coding-agent`.
- **`## Consumers`**: content unchanged — still describes Pi extension host loading the `default export`.
- **`## Module Structure`**: update the file table. Remove rows for `ask-user-question.ts`, `todo.ts`, `advisor.ts`, `todo-overlay.ts`. Add rows for the four new modules: `siblings.ts`, `session-hooks.ts`, `setup-command.ts`, `update-agents-command.ts`. Existing rows for `guidance.ts`, `agents.ts`, `package-checks.ts`, `pi-installer.ts`, `git-context.ts`, `index.ts` stay; their descriptions updated to match current roles (e.g. `index.ts` description becomes "thin composer; three registrar calls").
- **`## Tool Registration (pi.registerTool)`**: heading kept. Content keeps the code example as a reference pattern, prefixed with a one-line note: _"rpiv-core registers zero tools today — it is a pure orchestrator. This pattern applies to sibling plugins. For a live example see `rpiv-advisor/advisor.ts`."_
- **`## Branch Replay (State Reconstruction)`**: heading kept. Content keeps the `reconstructMyState` example as a reference pattern, prefixed with: _"rpiv-core has no tool state today (all state is sibling-owned). The pattern below applies to sibling plugins and to any future stateful tool added here."_ The trailing comment "Call from: session_start, session_compact, session_tree" stays because it describes the pattern for siblings that do reconstruct state.
- **`## Architectural Boundaries`**: drop the two bullets that reference extinct state (`NO state mutation in tool_execution_end` and `NO advisor in active tools when model unset: stripped each before_agent_start via pi.setActiveTools()`). Keep the other bullets (`NO business logic in index.ts`, `NO ExtensionAPI in utility modules`). Append the two new boundaries: `NO runtime import of sibling packages`, `NO tools registered here — all tool surfaces live in siblings`.
- **`<important if="adding a new tool">`**: content replaced with _"New tools belong in a sibling plugin. rpiv-core is pure orchestrator. For a canonical pattern see rpiv-advisor/advisor.ts (tool) + rpiv-advisor/index.ts (registration)."_ Heading preserved.
- **`<important if="adding a new slash command">`**: edit the steps — current Step 2 says "Complex handler: create my-command.ts"; promote this to the default pattern (matches `setup-command.ts` / `update-agents-command.ts`). Step 1 "Short handler (no UI): inline" becomes "Short handler: may still be inline in `index.ts` but prefer extraction." Other steps (interactive guard, ctx.ui methods) unchanged.
- **`<important if="adding a session lifecycle hook">`**: edit Step 1's event list — remove `session_tree` (not wired; rpiv-core has no tool state needing tree-time reconstruction). Step 3 ("State reset/reconstruction must be called from session_start, session_compact, and session_tree") becomes "State reset must run from `session_start` and `session_compact`. `session_tree` is not wired by rpiv-core — sibling plugins that maintain tool state subscribe it themselves."
- **`<important if="adding a pure utility module">`**: content mostly unchanged. Step 1 unchanged. Step 2 (`returns a value or void; never throws`) unchanged. Step 3 (config with credentials / `chmodSync`) trimmed — rpiv-core has no credential files; keep the general "Config files: loadX returns empty default on absent/parse errors; saveX swallows all errors" but drop the credentials clause. Step 4 (`PACKAGE_ROOT` via `import.meta.url`) unchanged.
- **`<important if="adding a persistent widget">`**: heading + 4-step pattern kept. Content prefixed with: _"TodoOverlay (the canonical widget) was extracted to `@juicesharp/rpiv-todo`. No widgets currently live in rpiv-core. Follow the pattern below if adding one."_ The four playbook steps stay as reference.

No section added. No section removed. Section count: 12 → 12.

```markdown
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
\`\`\`
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
\`\`\`

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
```

### .rpiv/guidance/skills/architecture.md — MODIFY (surgical)

Preserve all existing sections. Surgical edit within the existing `## Dependencies` section only:
- The `extensions/rpiv-core/` bullet edits from "provides the runtime environment skills assume — `ask_user_question`, `todo`, `advisor` tools; git context injection; `thoughts/` directory scaffolding" → "provides session-time scaffolding (`thoughts/` directories), guidance injection, git-context injection, bundled-agent sync. The `ask_user_question`, `todo`, `advisor` tools are provided by sibling plugins".

No other sections touched. Existing body-level references to `ask_user_question` (lines 49, 78 — describing tool usage, which is still correct) are unchanged.

```markdown
# MODIFY lines 6-8 (Dependencies section, first bullet)
## Dependencies
- **Pi framework**: reads `"skills": ["./skills"]` from `package.json`; injects SKILL.md body as system context on invocation
- **Sibling plugins**: provide the tools skills call — `ask_user_question` (`@juicesharp/rpiv-ask-user-question`), `todo` (`@juicesharp/rpiv-todo`), `advisor` (`@juicesharp/rpiv-advisor`), `web_search`/`web_fetch` (`@juicesharp/rpiv-web-tools`), `Agent` (`@tintinweb/pi-subagents`)
- **`extensions/rpiv-core/`**: session-time scaffolding (thoughts/ dirs), guidance injection, git-context injection, bundled-agent sync

# Lines 49 and 78 unchanged (the existing `ask_user_question` references describe skill-side usage of the sibling tool — accurate, no edit needed).
```

### .rpiv/guidance/agents/architecture.md — MODIFY

Fix the "auto-copied… skip-if-exists" misdescription (line 6) and the two sibling-ownership references (lines 24, 59). The file at this path already has the correct manifest-sync description in the git-tracked version — no edit needed there. Only `.pi/agents/CLAUDE.md` carries the stale copy.

```markdown
# MODIFY .rpiv/guidance/agents/architecture.md:24
  precedent-locator.md    — Git history mining: + bash (git commands only; `@tintinweb/pi-subagents` provides the Agent dispatch runtime)

# MODIFY .rpiv/guidance/agents/architecture.md:59
- `+ web_search, web_fetch` → only `web-search-researcher` (tools provided by `@juicesharp/rpiv-web-tools`)
```

### .pi/agents/CLAUDE.md — MODIFY

Replace the stale "auto-copied … skip-if-exists" description on lines 6 and 75 with the current manifest-based detect-vs-apply behavior.

```markdown
# MODIFY line 6
At session start, `extensions/rpiv-core/agents.ts` syncs bundled `.md` files to `<cwd>/.pi/agents/` — adding new files and detecting outdated or removed agents (detect-only, no overwrite). Use `/rpiv-update-agents` to apply full sync: add new, update changed, remove stale managed files.

# MODIFY line 75 (in the "Adding a New Agent" important block)
8. The file is auto-synced to `<cwd>/.pi/agents/` at session start — no registration step needed. `/rpiv-update-agents` applies full sync including new agents.
```

### package.json — MODIFY

Add `LICENSE` to the `files` allowlist so the shipped tarball declares it explicitly (npm auto-includes LICENSE by default, but explicit is better).

```json
// MODIFY line 20
"files": ["extensions/", "skills/", "agents/", "scripts/", "README.md", "LICENSE"],
```

### scripts/types.js — DELETE

One-line `export {};` orphan. Zero importers in the repo.

```
// File deleted; no replacement.
```

### thoughts/shared/ — DELETE (16 files)

Eight dead-in-repo plan/design pairs (research Q9) and two misfiled sibling-repo artifacts:

```
thoughts/shared/designs/2026-04-10_22-34-39_todo-tool-cc-parity.md
thoughts/shared/plans/2026-04-11_07-30-37_todo-tool-cc-parity.md
thoughts/shared/designs/2026-04-11_07-19-35_todo-list-overlay-above-input.md
thoughts/shared/plans/2026-04-11_07-38-04_todo-list-overlay-above-input.md
thoughts/shared/designs/2026-04-11_14-10-07_advisor-strategy-pattern.md
thoughts/shared/plans/2026-04-11_14-43-28_advisor-strategy-pattern.md
thoughts/shared/designs/2026-04-12_00-33-33_advisor-effort-configuration.md
thoughts/shared/plans/2026-04-12_00-46-13_advisor-effort-configuration.md
thoughts/shared/designs/2026-04-12_12-21-43_advisor-settings-persistence.md
thoughts/shared/plans/2026-04-12_12-59-39_advisor-settings-persistence.md
thoughts/shared/designs/2026-04-12_03-55-13_skill-flow-pipeline.md
thoughts/shared/plans/2026-04-12_04-17-20_skill-flow-pipeline.md
thoughts/shared/designs/2026-04-13_11-07-13_pi-subagent-context-discipline.md
thoughts/shared/plans/2026-04-13_11-51-36_pi-subagent-context-discipline.md
thoughts/shared/designs/2026-04-15_03-57-55_ask-user-question-wrap-fix.md
thoughts/shared/designs/2026-04-15_ask-user-question-text-wrapping-fix.md
thoughts/shared/plans/2026-04-15_00-06-55_ask-user-question-wrap-fix.md
```

Rationale per file tracked in research Q9 table. `isolated: true` residue on `agents/*.md` is **not** cleaned up here — it is intentional (see Decision 5).

## Desired End State

New-developer reading `extensions/rpiv-core/index.ts` sees a table of contents:

```typescript
export default function (pi: ExtensionAPI) {
	registerSessionHooks(pi);
	registerUpdateAgentsCommand(pi);
	registerSetupCommand(pi);
}
```

Adding a sixth sibling:

```typescript
// One change in siblings.ts — every consumer picks it up.
{
	pkg: "npm:@juicesharp/rpiv-whatever",
	matches: /rpiv-whatever/i,
	provides: "whatever it provides",
},
```

Asking "where does the session_start warning come from" lands the reader directly in `session-hooks.ts` → `warnMissingSiblings` → `findMissingSiblings` → `SIBLINGS` — three hops, each a named intention.

## File Map

```
extensions/rpiv-core/siblings.ts                  # NEW — declarative SIBLINGS registry
extensions/rpiv-core/package-checks.ts            # MODIFY — thin projection over SIBLINGS
extensions/rpiv-core/session-hooks.ts             # NEW — lifecycle hook wiring
extensions/rpiv-core/setup-command.ts             # NEW — /rpiv-setup handler
extensions/rpiv-core/update-agents-command.ts     # NEW — /rpiv-update-agents handler
extensions/rpiv-core/index.ts                     # MODIFY — thin composer (~20 lines)
extensions/rpiv-core/agents.ts                    # MODIFY — drop legacy aliases + wrapper
.rpiv/guidance/architecture.md                    # MODIFY — drop stale /todos, /advisor
.rpiv/guidance/extensions/rpiv-core/architecture.md  # MODIFY — full rewrite
.rpiv/guidance/skills/architecture.md             # MODIFY — fix dependencies bullet
.rpiv/guidance/agents/architecture.md             # MODIFY — fix 2 sibling-ownership lines
.pi/agents/CLAUDE.md                              # MODIFY — fix 2 stale-sync references
package.json                                      # MODIFY — LICENSE in files allowlist
scripts/types.js                                  # DELETE — orphan
thoughts/shared/designs/...                       # DELETE — 8 files
thoughts/shared/plans/...                         # DELETE — 8 files
```

## Ordering Constraints

- Slice 1 (`siblings.ts`) must land before Slice 2 (`package-checks.ts`) and any consumer.
- Slice 2 must land before Slices 3-4 (they import `findMissingSiblings`).
- Slices 3, 4, 5 are independent of each other (same dep set from Slices 1-2).
- Slice 6 (`index.ts`) imports from Slices 3, 4, 5 — must land after all three.
- Slice 7 (`agents.ts` trim) depends on Slice 5 landing (confirms no external callers of the wrapper in `update-agents-command.ts`).
- Slice 8 (guidance docs) should land last among code slices so the docs describe the final shape.
- Slice 9 (cleanup sweep) is fully independent — can land at any time.

## Verification Notes

- `npm install && node -e "require('./extensions/rpiv-core/index.js')"` should not throw. (Pi compiles TS at install; no local `tsc`.)
- Running `pi` in the repo root must produce the same user-visible behavior: session_start warnings if siblings missing, root guidance injected, thoughts/ directories created, bundled agents synced.
- `/rpiv-setup` must install the same five packages in the same order as before.
- `/rpiv-update-agents` must produce the same "N added, M updated, K removed" summary format.
- `grep -R "copyBundledAgents\|result\.copied\|result\.skipped" extensions/` returns zero matches after Slice 7.
- `grep -R "ask-user-question\.ts\|todo\.ts\|advisor\.ts\|todo-overlay\.ts\|setActiveTools\|tool_execution_end\|session_tree\|skip-if-exists" .rpiv/guidance/ .pi/agents/` returns zero matches after Slice 8.
- `ls scripts/types.js` fails after Slice 9.
- `ls thoughts/shared/plans/` and `ls thoughts/shared/designs/` no longer list the 16 deleted files.
- `node -e "const s=require('./package.json'); console.log(s.files.includes('LICENSE'))"` prints `true`.

## Performance Considerations

`findMissingSiblings()` reads `~/.pi/agent/settings.json` once per call. Compared to the pre-refactor shape where `session_start` called five separate `has*Installed()` probes (each re-reading the file), this is a 5× → 1× reduction per session_start. `/rpiv-setup` also drops from 5 probes to 1.

## Migration Notes

Not applicable — no persisted state, no schema changes. The refactor is transparent at runtime: same hooks, same commands, same file I/O.

Callers outside this repo depending on `copyBundledAgents` or the `SyncResult.copied`/`.skipped` aliases would break — research confirms no external callers. If any surface later, they can call `syncBundledAgents(cwd, overwrite)` directly and compute `copied = added ∪ updated` themselves.

## Pattern References

- `/Users/sguslystyi/rpiv-advisor/index.ts:20-28` — canonical thin-composer shape for `default export`.
- `/Users/sguslystyi/rpiv-advisor/advisor.ts:76-90` — `MSG_*`/`ERR_*` constants grouped by concern at file top.
- `/Users/sguslystyi/rpiv-todo/todo.ts:60-65` — declarative `Record`/array tables replacing imperative dispatch.
- `/Users/sguslystyi/rpiv-todo/todo.ts:18,29,56,67,78,134` — banner-comment section divider pattern (`// ---- Section ----`).
- `/Users/sguslystyi/rpiv-advisor/advisor.ts:402-449` — command handler shape: guard → declarative body → named UI helper → sentinel-switch.

## Developer Context

**Q1 (Scope):** How wide should the refactor land — code+docs+intention refactor, + skill hygiene, or surgical-only?
**A:** Code + docs + intention refactor. Skills stay untouched.

**Q2 (Registry depth):** Unify the three sibling-inventory sites into one declarative `SIBLINGS` registry, registry + keep `has*Installed()` wrappers, or dedupe `index.ts` only?
**A:** Single declarative registry. `package-checks.ts` becomes a thin projection; `has*Installed()` wrappers disappear.

**Q3 (Layout):** Per-concern files, in-file named functions, or hybrid?
**A:** Per-concern files (`session-hooks.ts`, `setup-command.ts`, `update-agents-command.ts`).

**Q4 (Cleanup):** `session_tree` hook + legacy `SyncResult` aliases — drop both, drop session_tree doc only, or wire session_tree defensively?
**A:** Drop both.

**Correction during Step 3 dimension sweep:** The inherited research artifact (Summary + Q9 table + Developer Context Q2) classified `isolated: true` on 8/9 agents as "stale residue" from the rejected `pi-subagent-context-discipline` plan. Developer corrected this: `isolated: true` is intentional and must be preserved. Only `max_turns:` was rejected (never shipped, nothing to remove). Saved to memory as `project_isolated_agents.md` to prevent recurrence.

**Correction during Slice 8 micro-checkpoint:** Initial design framed the guidance rewrite as allowing new sections and "full rewrite" of `.rpiv/guidance/extensions/rpiv-core/architecture.md`. Developer corrected: **guidance docs must preserve existing structure — no new sections, no removed sections, surgical content editing only**. Revised Slice 8 to edit content within existing sections only; section count per file stays identical pre/post.

## Design History

- Slice 1: Sibling registry foundation (`siblings.ts`) — approved as generated
- Slice 2: package-checks rewrite over registry — approved as generated
- Slice 3: Session hooks extractor (`session-hooks.ts`) — approved as generated
- Slice 4: /rpiv-setup command extractor (`setup-command.ts`) — approved as generated
- Slice 5: /rpiv-update-agents command extractor (`update-agents-command.ts`) — approved as generated
- Slice 6: Thin `index.ts` composer — approved as generated
- Slice 7: `agents.ts` legacy-alias removal — approved as generated
- Slice 8: Guidance doc rewrite (5 files) — approved as generated (revised to surgical-only: no new or removed sections, content-level edits only)
- Slice 9: Stray files + misfiled + dead plan sweep + package.json fix — approved as generated

## References

- Research artifact: `thoughts/shared/research/2026-04-15_21-11-56_rpiv-pi-state-audit.md`
- Research questions: `thoughts/shared/questions/2026-04-15_14-30-00_rpiv-pi-state-audit.md`
- Sibling plugin templates:
  - `/Users/sguslystyi/rpiv-advisor/index.ts`, `/Users/sguslystyi/rpiv-advisor/advisor.ts`, `/Users/sguslystyi/rpiv-advisor/advisor-ui.ts`
  - `/Users/sguslystyi/rpiv-todo/todo.ts`, `/Users/sguslystyi/rpiv-todo/todo-overlay.ts`
  - `/Users/sguslystyi/rpiv-ask-user-question/index.ts`, `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts`
- Primary extraction commit: `c388ea9` (2026-04-13)
- Agent-sync refactor commits: `b562056`, `0fdfe95` (2026-04-14)
- Naming-conventions-unification plan (prior precedent): `thoughts/shared/plans/2026-04-14_14-04-32_naming-conventions-unification.md`
