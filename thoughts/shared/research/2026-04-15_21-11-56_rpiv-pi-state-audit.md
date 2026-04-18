---
date: 2026-04-15T21:11:56Z
researcher: Claude Code
git_commit: 1c5ebfa
branch: main
repository: rpiv-pi
topic: "Systematic audit of rpiv-pi current state after sibling plugin extraction"
tags: [research, codebase, rpiv-core, guidance, agents, skills, extraction, audit]
status: complete
questions_source: "thoughts/shared/questions/2026-04-15_14-30-00_rpiv-pi-state-audit.md"
last_updated: 2026-04-15
last_updated_by: Claude Code
---

# Research: rpiv-pi Current-State Audit

## Research Question

After the sibling-plugin extraction (commit `c388ea9`, 2026-04-13) pulled `ask_user_question`, `todo`, `advisor`, and `web_search`/`web_fetch` into four `@juicesharp/rpiv-*` plugins and `Agent`/`get_subagent_result`/`steer_subagent` into `@tintinweb/pi-subagents`, the rpiv-pi package should now be a pure-infrastructure orchestrator. The audit asks: did the extraction land cleanly, and what residual drift, stale guidance, and unfinished work remains inside rpiv-pi itself?

## Summary

The extraction landed cleanly at the code layer but left substantial **drift in documentation and secondary systems**:

- **Extension code is pure infrastructure** — zero `pi.registerTool` calls, two commands (`/rpiv-update-agents`, `/rpiv-setup`), zero runtime imports of any sibling package. (`extensions/rpiv-core/index.ts:37-275`)
- **Six guidance files carry ~20 stale references** to extracted modules, deleted tools, and an extinct `tool_execution_end` hook. The worst offender is `.rpiv/guidance/extensions/rpiv-core/architecture.md:4,18-21,28-100` which still documents `ask-user-question.ts`, `todo.ts`, `advisor.ts`, `todo-overlay.ts`, a full `pi.registerTool` tutorial, branch-replay `reconstructMyState` patterns, and a `setActiveTools` advisor rule — none of which apply to the current repo.
- **`/rpiv-setup` correctly labels all five siblings "required"** despite `advisor` having zero call sites in bundled skills or agents — per developer input, `advisor` **will be actively used in upcoming flow updates**, so the classification is intentional and the "5 required siblings" warning stays accurate.
- **Agent sync is healthy** — `agents.ts` manifest-based sync (post `b562056` refactor, with fix `0fdfe95` for the detect-only pending-remove leak) works correctly; the 9-entry `agents/` source exactly matches the 9-entry `.rpiv-managed.json` and the 9 managed files on disk in `.pi/agents/`.
- **Skill-side tool coupling is brittle but currently functional** — 12 skills name `ask_user_question` bare (30 sites); only `code-review/SKILL.md:44` names the `todo` tool; 7/17 skills omit `allowed-tools` frontmatter without an obvious principle. All 9 subagent names resolve.
- **Plans status** — the primary extraction plan is DONE; 6 plans are DEAD-IN-REPO (done in siblings); `skill-flow-pipeline` was never implemented; `pi-subagent-context-discipline` has been **rejected by the developer** — its partial residue (`isolated: true` on 8/9 agents) is now stale and should be removed.
- **Stray artifacts** — `scripts/types.js` is a 1-line `export {};` orphan that ships in the npm tarball; `LICENSE` is not in `package.json:20` `files` allowlist; two in-progress sibling-repo artifacts (`designs/2026-04-15_ask-user-question-text-wrapping-fix.md` + its plan) are misfiled here.
- **`session_tree` is not subscribed** — `extensions/rpiv-core/index.ts` wires `session_start`, `session_compact`, `session_shutdown`, `tool_call`, `before_agent_start` only, contradicting `.rpiv/guidance/extensions/rpiv-core/architecture.md:98` which claims state reconstruction must run from `session_start`/`session_compact`/`session_tree`.

## Detailed Findings

### Extension Entry & Zero-Tool Verification (Q1)

- Pi entry: `package.json:21-24` → `extensions/rpiv-core/index.ts:37` default export `function(pi: ExtensionAPI)`.
- Repo-wide grep for `registerTool` in `extensions/` returns **zero matches**. rpiv-core is a pure orchestrator.
- Exactly two commands registered: `rpiv-update-agents` (`index.ts:141-170`) and `rpiv-setup` (`index.ts:174-275`).
- Every sibling package name appears only as a **string literal**, never as an `import`: doc-block at `index.ts:12-13`, missing-array at `index.ts:90-94`, install list at `index.ts:185,191,197,203,209`.
- Runtime import inventory confirms only: Node built-ins, `@mariozechner/pi-coding-agent` (the ExtensionAPI type+value), and five relative modules (`./guidance.js`, `./git-context.js`, `./agents.js`, `./pi-installer.js`, `./package-checks.js`).
- Detection is filesystem-based via `readInstalledPackages()` reading `~/.pi/agent/settings.json` (`package-checks.ts:15-31`) and matching five case-insensitive regexes (`package-checks.ts:33-50`).

**Conclusion**: Extraction premise holds. rpiv-core has no compile-time or runtime coupling to the sibling packages it advertises.

### Stale Guidance Reference Inventory (Q2)

Complete inventory. Six files examined under `.rpiv/guidance/` + `.pi/agents/CLAUDE.md`:

| File:line | Stale text | Reality |
|---|---|---|
| `.rpiv/guidance/architecture.md:26` | `\| /todos \| Show current todo list \|` | `/todos` not registered by `index.ts`; lives in `@juicesharp/rpiv-todo` |
| `.rpiv/guidance/architecture.md:27` | `\| /advisor \| Configure advisor model + effort level \|` | Command lives in `@juicesharp/rpiv-advisor` |
| `.rpiv/guidance/architecture.md:33` | "supporting tooling (guidance injection, advisor, todo tracking)" | Only `guidance` + `git-context` are local; advisor/todo are sibling-owned |
| `.rpiv/guidance/architecture.md:44` | Ladder described as `AGENTS > architecture > sub/architecture` — omits CLAUDE.md | Actual ladder: `AGENTS.md > CLAUDE.md > .rpiv/guidance/<sub>/architecture.md` per `guidance.ts:72-80` |
| `.rpiv/guidance/extensions/rpiv-core/architecture.md:4` | "Manages in-session state (todos, advisor config, guidance injection)" | Only guidance dedup Set + git-context cache remain |
| `.rpiv/guidance/extensions/rpiv-core/architecture.md:18-21` | Module table lists `ask-user-question.ts`, `todo.ts`, `advisor.ts`, `todo-overlay.ts` | None of those files exist; missing from table: `pi-installer.ts`, `git-context.ts`, `guidance.ts` |
| `.rpiv/guidance/extensions/rpiv-core/architecture.md:28-50` | Full `pi.registerTool({...})` tutorial | No tools registered in this repo — pattern is sibling-only |
| `.rpiv/guidance/extensions/rpiv-core/architecture.md:53-70` | "Branch Replay" `reconstructMyState` tutorial | No tool state exists here to reconstruct |
| `.rpiv/guidance/extensions/rpiv-core/architecture.md:75` | "NO state mutation in tool_execution_end" | No `tool_execution_end` handler wired (`index.ts` only subscribes to `session_start`, `session_compact`, `session_shutdown`, `tool_call`, `before_agent_start`) |
| `.rpiv/guidance/extensions/rpiv-core/architecture.md:76` | "NO advisor in active tools when model unset: stripped each `before_agent_start` via `pi.setActiveTools()`" | Advisor gone; `setActiveTools` appears nowhere in the repo |
| `.rpiv/guidance/extensions/rpiv-core/architecture.md:78-84` | "Adding a New Tool" playbook | Would create dead code; new tools belong in siblings |
| `.rpiv/guidance/extensions/rpiv-core/architecture.md:98` | "State reset/reconstruction must be called from `session_start`, `session_compact`, and `session_tree`" | `session_tree` is not subscribed in `index.ts` |
| `.rpiv/guidance/extensions/rpiv-core/architecture.md:110-116` | "Adding a Persistent Widget" `TodoOverlay` playbook | `TodoOverlay` extracted; no widget exists locally |
| `.rpiv/guidance/skills/architecture.md:8` | "extensions/rpiv-core provides `ask_user_question`, `todo`, `advisor` tools" | None of the three are local — sibling-owned |
| `.rpiv/guidance/skills/architecture.md:49,78` | `ask_user_question` references | Tool no longer ships with rpiv-pi |
| `.rpiv/guidance/agents/architecture.md:24,59` | `web_search`, `web_fetch` as locally-provided | Sibling-owned (`@juicesharp/rpiv-web-tools`) |
| `.pi/agents/CLAUDE.md:6,75` | "auto-copied … skip-if-exists" | Current behavior is manifest-based detect (session_start) vs apply (`/rpiv-update-agents`) per `agents.ts:164-297` — not "skip-if-exists" |

Guidance that is correct today: `.rpiv/guidance/scripts/architecture.md`, `.rpiv/guidance/agents/architecture.md` body on sync flow at line 6.

### Session Hook Chain & Ordering (Q3)

`session_start` handler (`index.ts:39-102`) runs seven steps in strict order — no intra-handler parallelism:

1. `clearInjectionState()` (`index.ts:40` → `guidance.ts:107`) empties the dedup `Set<string>`.
2. `injectRootGuidance(ctx.cwd, pi)` (`index.ts:41` → `guidance.ts:122-152`). Critical ordering: marks path in Set **after** successful `readFileSync` but **before** `pi.sendMessage` (`guidance.ts:139,147-151`). On read failure, the function returns without marking — preserves retry path. Codified rule at `guidance.ts:178` ("Mark before sendMessage — idempotence > reliability").
3. Five `mkdirSync` scaffolds (`index.ts:44-53`): `thoughts/shared/{research,questions,designs,plans,handoffs}`. No try/catch — a permissions failure here aborts remaining steps.
4. `takeGitContextIfChanged(pi)` + conditional `pi.sendMessage` (`index.ts:56-59`).
5. `syncBundledAgents(ctx.cwd, false)` (`index.ts:63`) — detect-only mode.
6. UI notifications for `added` / `pendingUpdate` / `pendingRemove`, gated on `ctx.hasUI` (`index.ts:64-85`).
7. Missing-plugin aggregator, also `ctx.hasUI`-gated (`index.ts:87-101`). Calls each `has*Installed()` probe once; each re-reads `~/.pi/agent/settings.json` — no memoization, so the file is read up to 5× per session_start.

`session_compact` (`index.ts:105-114`) mirrors a subset: clears both guidance and git-context state (plus `resetInjectedMarker` for transcript rebuild), re-injects root guidance + git context. Deliberately skips thoughts/ scaffolding, agent sync, and missing-plugin warnings (those are bootstrap concerns).

`session_shutdown` (`index.ts:117-121`) is pure symmetric teardown.

**`session_tree` is not subscribed.** Only five events are wired: `session_start`, `session_compact`, `session_shutdown`, `tool_call` (`index.ts:124`), `before_agent_start` (`index.ts:132`). Guidance doc `architecture.md:98` is wrong on this point.

### Bundled-Agent Manifest System (Q4)

`syncBundledAgents(cwd, apply)` (`agents.ts:164-297`) end-to-end:

- `PACKAGE_ROOT` resolved via `fileURLToPath(import.meta.url)` + three `dirname` walks (`agents.ts:27-30`) — layout-fragile; any future relocation of `agents.ts` silently misresolves.
- `BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents")` (`agents.ts:33`).
- Target `join(cwd, ".pi", "agents")` (`agents.ts:171`); `mkdirSync(..., { recursive: true })`; single `manifest-write` error on failure.
- Manifest `.rpiv-managed.json` lifecycle: `readManifest:94-105` fail-soft; `writeManifest:111-119` swallows errors; `bootstrapManifest:130-148` on first-run after upgrade claims any pre-existing `.md` file in `<cwd>/.pi/agents/` whose name matches the current bundled source.
- Four per-file branches (`agents.ts:194-256`): **new** file → `copyFileSync` + push `added` (`:198-210`); **identical** bytes → push `unchanged + skipped` (`:237-239`); **divergent + apply** → overwrite, push `updated` (`:240-251`); **divergent + detect** → push `pendingUpdate + skipped` (`:252-255`).
- Stale-managed removal (`agents.ts:259-279`): iterates manifest-minus-source; `apply=true` → `unlinkSync` + `removed`; `apply=false` → `pendingRemove` only, file stays on disk.
- Critical manifest-update detail (`agents.ts:285-288`): `apply=false` manifest = `sourceEntries ∪ pendingRemove` — pending-removal names are kept so the next apply still recognizes them. `apply=true` manifest = `sourceEntries` exactly.
- Legacy aliases `copied`/`skipped` (`agents.ts:62-65`) exist only for the back-compat wrapper `copyBundledAgents` (`agents.ts:307-312`); new callers use `added`/`updated`/`pendingUpdate`/`pendingRemove`/`removed`/`unchanged` directly.

**On-disk verification**: 9 `.md` files in `agents/` (source) == 9 entries in `.pi/agents/.rpiv-managed.json` == 9 managed `.md` files on disk. Additionally present but correctly unmanaged: `.pi/agents/CLAUDE.md` (user-authored, not in source → filter rejects via `sourceNames.has(...)`) and `.pi/agents/.DS_Store` (not `.md` → filter rejects via `.endsWith(".md")`).

**Edge-case behaviors worth noting**:
- Divergent + `apply=true` silently overwrites without confirmation; a user who edited a bundled agent in place loses changes on `/rpiv-update-agents`.
- If `unlinkSync` fails during apply, manifest still drops the name (manifest = `sourceEntries`), orphaning the file from future cleanup.
- Headless mode (`!ctx.hasUI`) surfaces no drift notifications — invisible to the user.

### Guidance Resolution Ladder (Q5)

`resolveGuidance(filePath, projectDir)` (`guidance.ts:52-97`):

- Walks from project root to the touched file's directory. At each `depth`, picks at most one of `AGENTS.md` > `CLAUDE.md` > `.rpiv/guidance/<sub>/architecture.md` — first-match-wins via `break` at `:91`.
- Depth 0 skips `AGENTS.md` and `CLAUDE.md` (`:71-74`) because Pi's `resource-loader.js:30-46` already injects those from `<cwd>`. Depth 0 still checks `.rpiv/guidance/architecture.md` — Pi's loader does not see the shadow tree.
- Guards: returns `[]` for paths outside project root (`:57-59`).
- Dedup keys normalized to forward slashes for Windows safety (`:86`).

`handleToolCallGuidance` (`guidance.ts:162-192`):

- Tool gate: `read`/`edit`/`write` only (`:167`).
- Path extraction tolerates both `file_path` and `path` (`:169`).
- Filters already-injected files via module-level `injectedGuidance: Set<string>` at `guidance.ts:104`.
- **Mark-before-send ordering** at `:179-181` — synchronous `Set.add` before `pi.sendMessage`. Preserves "duplicate injection is worse than missed injection" invariant.
- One `pi.sendMessage` per tool_call with all new parts joined by `\n\n---\n\n` and `display: false` so the LLM sees it but the user transcript does not.

`formatLabel(g)` (`guidance.ts:201-213`):
- `architecture` → strips `.rpiv/guidance/` prefix + `/architecture.md` suffix; empty subpath → `"root"`; output: `"<sub> (architecture.md)"`.
- `agents`/`claude` → output: `"<sub> (AGENTS.md|CLAUDE.md)"`.

**Dedup Set lifecycle**:

| Event | Handler | Operation |
|---|---|---|
| `session_start` | `index.ts:39` | `clear()` → `add(".rpiv/guidance/architecture.md")` if root exists |
| `session_compact` | `index.ts:105` | same as session_start |
| `session_shutdown` | `index.ts:117` | `clear()` only |
| `tool_call` (read/edit/write) | `index.ts:124` | `add(g.relativePath)` for each new file before sendMessage |

### Git-Context Caching & Injection (Q6)

Two independent module-level state slots (`git-context.ts:13-20`):
- `cache: GitContext | null | undefined` (`:20`). Three-state: `undefined` = not loaded; `null` = not a git repo / load failed (don't retry until invalidation); object = valid.
- `lastInjectedSig: string | null` (`:17`). Signature of last value pushed into transcript; `null` = transcript needs re-injection.

`loadGitContext` (`:33-59`):
- Two parallel `pi.exec("git", ["rev-parse", ...])` via `Promise.all` (`:35-38`). Header comment explains why two calls, not one: `--abbrev-ref` persists across subsequent revs.
- Detached HEAD literal `"HEAD"` remapped to `"detached"` (`:42`).
- Third sequential `pi.exec("git", ["config", "user.name"], ...)` inside its own try/catch (`:45`); falls through to `process.env.USER || "unknown"` (`:50`).
- Returns `null` only when both branch and commit are empty; partial output falls through to `"no-branch"` / `"no-commit"` placeholders.

`takeGitContextIfChanged` (`:68-75`) is the sole reader/writer of `lastInjectedSig`. Signature format: `${branch}\n${commit}\n${user}` — newline-delimited to avoid ambiguity.

**Three entry points use two different Pi delivery contracts**:

| Entry | Location | Contract |
|---|---|---|
| `session_start` | `index.ts:56-59` | `pi.sendMessage({ customType: "rpiv-git-context", content, display: false })` |
| `session_compact` | `index.ts:110-113` | same `pi.sendMessage` |
| `before_agent_start` | `index.ts:132-138` | handler-return: `return { message: { customType, content, display: false } }` |

Both paths route through `takeGitContextIfChanged`, so the first caller to fire "claims" the signature and the other becomes a no-op until invalidation. The consumer (agent) sees a uniform `rpiv-git-context` record regardless.

**Cache invalidation**: `index.ts:126-128` in the `tool_call` hook — when `isToolCallEventType("bash", event) && isGitMutatingCommand(event.input.command)`, call `clearGitContextCache()`. The regex at `git-context.ts:77-81` matches `checkout|switch|commit|merge|rebase|pull|reset|revert|cherry-pick|worktree|am|stash`. Notable omissions: `fetch` (no HEAD change), `push` (remote-only). Only the value cache is cleared; `lastInjectedSig` is left intact so an equivalent-signature reload still no-ops.

### /rpiv-setup & Sibling-Call-Site Audit (Q7)

`/rpiv-setup` handler (`index.ts:174-275`):
- UI guard at `:177-180`.
- Missing-array build at `:182-213` with five entries and `"required — …"` reasons.
- Confirm prompt at `:222-231` via `ctx.ui.confirm(title, body)`.
- Serial install loop at `:239-257` calling `spawnPiInstall(pkg, 120_000)`; try/catch records errors; stderr/stdout/`exit N` snippet (300-char slice) on non-zero exit.
- Split report at `:259-273` with `✓ Installed` / `✗ Failed` blocks; `warning` severity if any failed.

`spawnPiInstall` (`pi-installer.ts:18-55`):
- Windows: `spawn("cmd.exe", ["/c", "pi", "install", pkg], { windowsHide: true })` — works around Pi's `spawn(..., { shell: false })` which can't launch `.cmd` shims.
- POSIX: `spawn("pi", ["install", pkg])`.
- Timeout: SIGTERM, then 5-second escalation to SIGKILL; `code: 124` + `[timed out after Nms]` appended to stderr.
- Settle-once guard (`:33-38`) prevents double-resolve.

**Sibling-tool call-site table** (counts exclude `extensions/`, `package.json`, `README.md`):

| Sibling tool | Provided by | Skill sites | Agent sites | Where |
|---|---|---|---|---|
| `Agent` (subagent spawn) | `@tintinweb/pi-subagents` | 51 across 12 skills | 0 | annotate-guidance, annotate-inline, code-review, design, discover, explore, outline-test-cases, research, resume-handoff, revise, validate, write-test-cases |
| `ask_user_question` | `@juicesharp/rpiv-ask-user-question` | 30 across 12 skills | 0 | annotate-guidance, annotate-inline, commit, design, discover, implement, outline-test-cases, plan, research, resume-handoff, revise, write-test-cases |
| `todo` | `@juicesharp/rpiv-todo` | 1 explicit tool reference (`code-review/SKILL.md:44`); 6 prose "todo list" mentions | 0 | code-review (explicit); implement, plan, validate, resume-handoff, discover (prose) |
| `web_search` / `web_fetch` | `@juicesharp/rpiv-web-tools` | 0 | 1 file (`agents/web-search-researcher.md:4` frontmatter `tools:`) | skills route through the agent by name only |
| `advisor` / `/advisor` | `@juicesharp/rpiv-advisor` | 0 | 0 | user-facing via `/advisor` only; README.md:147,182,194 |

**Developer disposition (see Developer Context)**: advisor stays "required" — planned active use in upcoming flow updates.

### Skill → Tool / Agent Reference Hygiene (Q8)

**`ask_user_question` references — 12 skills, 30 sites**:

| File | Lines |
|---|---|
| `skills/design/SKILL.md` | 140, 142, 147, 176, 206, 288, 322 (7) |
| `skills/outline-test-cases/SKILL.md` | 135, 140, 185, 218, 224 (5) |
| `skills/research/SKILL.md` | 128, 130, 139, 141 (4) |
| `skills/annotate-guidance/SKILL.md` | 74, 135, 140 (3) |
| `skills/annotate-inline/SKILL.md` | 72, 133, 138 (3) |
| `skills/write-test-cases/SKILL.md` | 177, 182 (2) |
| `skills/commit/SKILL.md` | 43 (1) |
| `skills/discover/SKILL.md` | 156 (1) |
| `skills/implement/SKILL.md` | 46 (1) |
| `skills/plan/SKILL.md` | 64 (1) |
| `skills/resume-handoff/SKILL.md` | 104 (1) |
| `skills/revise/SKILL.md` | 107 (1) |

Five skills omit it entirely: `code-review`, `validate`, `create-handoff`, `migrate-to-guidance`, `explore`.

**`todo` tool references — split style**:
- Explicit tool name (1 skill): `code-review/SKILL.md:44`
- Prose "todo list" with no tool name (6 skills): `implement/SKILL.md:20`, `plan/SKILL.md:226`, `validate/SKILL.md:143`, `resume-handoff/SKILL.md:117,206`, `discover/SKILL.md:22`

**`web_search`/`web_fetch` — correctly encapsulated**: zero skill sites; only `agents/web-search-researcher.md:4` declares them in frontmatter. Skills reference the agent by name; the agent owns the tools. Clean single point of coupling.

**`allowed-tools` frontmatter audit (10 declare, 7 omit)**:

| Skill | `allowed-tools` |
|---|---|
| annotate-guidance | `Agent, Read, Write, Glob, Grep` |
| annotate-inline | `Agent, Read, Write, Glob, Grep` |
| code-review | `Read, Bash(git *), Glob, Grep, Agent` |
| commit | `Bash(git *), Read, Glob, Grep` |
| create-handoff | `Read, Write, Bash(git *), Glob, Grep` |
| implement | `Read, Edit, Write, Bash(*), Glob, Grep, Agent` |
| migrate-to-guidance | `Bash, Read, Glob` |
| outline-test-cases | `Agent, Read, Write, Edit, Glob, Grep` |
| revise | `Edit, Read, Bash(git *), Glob, Grep, Agent` |
| validate | `Read, Bash(git *), Bash(make *), Glob, Grep, Agent` |
| design, discover, explore, plan, research, resume-handoff, write-test-cases | (omitted — full tool access) |

**Pattern assessment**: the omission set is not "needs Agent → omit" — `outline-test-cases` and all 7 declarers-with-Agent break that hypothesis. No single principle fits; omission appears to be inconsistency rather than policy.

**Subagent dispatch styles**:
- `subagent_type:` code-fence style (4 skills, 12 sites): `write-test-cases`, `annotate-guidance`, `annotate-inline`.
- Bold-prose "Use the **agent-name** agent" style (8 skills): `revise`, `outline-test-cases`, `explore`, `code-review`, `design`, `discover`, `research`.
- Both are name-coupled — only visual format differs.

**Subagent name resolution**: all 9 agent names referenced by skills resolve to existing files in `agents/`. No dangling references.

### Precedents & Lessons

8 relevant commits analyzed. Key commits:

- `c388ea9` (2026-04-13) — Extract tools into @juicesharp Pi plugins; bump to 0.4.0. The primary extraction.
- `31e9cc4` (2026-04-13) — Remove pi-permission-system workaround and phantom doc refs. First follow-up fix for stale architecture.md references.
- `b562056` (2026-04-14) — Sync bundled agents by content diff with manifest tracking. Introduced `.rpiv-managed.json`.
- `0fdfe95` (2026-04-14, ~2h after b562056) — Preserve pendingRemove entries in manifest during detect-only sync. Same-day regression fix.
- `6927aa6` (2026-04-14) — Document detect-on-startup + apply-on-command agent sync. Guidance docs lagged the code change.
- `daf7ee6` (2026-04-14) — Fix /rpiv-setup pi install spawn on Windows; bump 0.4.1. Introduced `pi-installer.ts`.
- `74b1cbb` (2026-04-13) — Surface subfolder CLAUDE.md/AGENTS.md via per-depth guidance resolver. Deleted CC-hook scripts.
- `4c6142f` (2026-04-14) — Inject git user and deduplicate git context messages across session lifecycle. Follow-up `df500d6` fixed an assignment-swap regression same day.
- `5691b95` (2026-04-14) — Move provider setup to optional prereq; add Pi Agent install; bump 0.4.3. `/rpiv-setup` copy/flow overhaul.

**Composite lessons**:
- **Stale guidance docs are the #1 recurring drift**. Every structural refactor (`c388ea9`, `b562056`, `74b1cbb`) required a follow-up commit to update `.rpiv/guidance/**/architecture.md`. The current audit finds this pattern continuing — the last sweep happened but missed `.rpiv/guidance/extensions/rpiv-core/architecture.md:4,18-21,28-100` (extensive content, not just a line).
- **"Required" vs actually-used siblings are distinct axes**. Per developer, this is intentional for advisor — planned use upcoming.
- **Cross-platform spawn paths are fragile** (`daf7ee6`). Any new `pi install` / `spawn` call needs win32 `cmd.exe /c` from day one; the pattern now lives in `pi-installer.ts`.
- **Detect vs apply must not share mutation paths** (`0fdfe95` regression). Any future sync/diff system should preserve pending operations in the detect path.
- **Module boundaries pay off slowly**: `8610ae5` (April 10) split monolithic `index.ts` into focused modules; `c388ea9` (April 13) cleanly deleted whole files per module rather than surgical edits.
- **Peer-deps pinned to `"*"`** (all 5 siblings in `package.json:25-35`) — no version coordination across the sibling matrix yet; will bite on breaking sibling changes.

### Unfinished Work from thoughts/shared/ (Q9)

Primary extraction plan `2026-04-13_17-52-15_extract-rpiv-plugins.md`: **DONE** with two intentional deviations (scoped `@juicesharp/` prefix added; version advanced to 0.4.4).

Other 13 `status: ready` plans:

| Plan | Status | Evidence |
|---|---|---|
| `2026-04-10_complete-pi-migration` | DONE | `package.json:21-24` Pi-shaped; rpiv-core extension exists |
| `2026-04-11_todo-tool-cc-parity` | DEAD-IN-REPO | `todo.ts` deleted; work is in `@juicesharp/rpiv-todo` |
| `2026-04-11_todo-list-overlay-above-input` | DEAD-IN-REPO | `todo-overlay.ts` extracted with the todo sibling |
| `2026-04-11_advisor-strategy-pattern` | DEAD-IN-REPO | `advisor.ts` absent; in `@juicesharp/rpiv-advisor` |
| `2026-04-12_advisor-effort-configuration` | DEAD-IN-REPO | same — advisor module not here |
| `2026-04-12_advisor-settings-persistence` | DEAD-IN-REPO | config path moved to `~/.config/rpiv-advisor/` in sibling |
| `2026-04-12_skill-flow-pipeline` | ABANDONED / not implemented | No `verify-names`, no `/pipeline` command, no `.rpiv/pipelines/` anywhere outside `thoughts/` |
| `2026-04-13_pi-claude-md-subfolder-resolution` | DONE | `guidance.ts` has the per-depth ladder (`:68-80`), `formatLabel` (`:201`), `GuidanceKind` (`:30`) |
| `2026-04-13_pi-subagent-context-discipline` | **REJECTED — OUTDATED** | **Per developer**: feature rejected; `isolated: true` on 8/9 agents is stale residue; `max_turns:` never shipped and should not be added |
| `2026-04-14_professional-readme-rewrite` | DONE | scoped name, MIT license, ongoing maintenance commits |
| `2026-04-14_agent-sync-refactor` | DONE | `.rpiv-managed.json` + manifest engine in place |
| `2026-04-14_naming-conventions-unification` | DONE except verifier | All 8 bare-verb skill dirs present; `scripts/verify-names.js` never shipped |
| `2026-04-15_ask-user-question-wrap-fix` | NOT-FOR-THIS-REPO | Plan body explicitly states "No rpiv-pi changes" — misfiled here; belongs to sibling |

**Misfiled design artifact**: `thoughts/shared/designs/2026-04-15_ask-user-question-text-wrapping-fix.md` points at sibling paths (`/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:52-78`) and the sibling version line (0.1.2 → 0.1.3, not rpiv-pi's 0.4.4). Same story as the companion plan — authored here but about a different repo.

### Stray / Unusual Artifacts (Q10)

| Artifact | Tracked in git | Shipped to npm | Notes |
|---|---|---|---|
| `scripts/types.js` | yes | **yes** via `scripts/` allowlist | Literally `export {};` — zero importers across repo; likely pre-Pi TS dual-mode leftover |
| `scripts/migrate.js` | yes | yes | Referenced by `skills/migrate-to-guidance/SKILL.md:24,57`; intentional |
| `.pi/.DS_Store`, `.pi/agents/.DS_Store` | **no** (`.gitignore:2,5`) | no (`.pi/` not in `files`) | Local noise only |
| `.pi/agents/*.md` + `.rpiv-managed.json` | no | no | Plugin's own checkout doubles as sync consumer — self-test artifact |
| `LICENSE` | yes | inconsistent — not in `files`, but npm auto-includes LICENSE by default | Works incidentally |
| no `tsconfig.json` | n/a | n/a | Intentional per extraction plan §Phase 5 — Pi compiles at install |
| no `dist/` / `build/` | n/a | n/a | Source-only publish |
| `.claude/settings.local.json` | no | no | Local CC config; outside tarball |

### Self-Referential Agent-Sync Setup

When a developer runs `pi` from `/Users/sguslystyi/rpiv-pi`, `session_start` (`index.ts:63`) calls `syncBundledAgents(ctx.cwd, false)`, which `PACKAGE_ROOT`-resolves to this same directory (`agents.ts:27-30`). So the plugin copies its own bundled agents into its own `.pi/agents/` — testing its sync feature against itself. `.pi/` is gitignored and not shipped, so there's no harm, but it's an unusual self-consumer setup worth flagging.

## Code References

- `extensions/rpiv-core/index.ts:37-275` — entry point, five session hooks, two commands
- `extensions/rpiv-core/index.ts:39-102` — session_start handler (seven-step ordered chain)
- `extensions/rpiv-core/index.ts:88-101` — missing-plugin aggregator warning
- `extensions/rpiv-core/index.ts:124-129` — tool_call handler (guidance + git cache invalidation)
- `extensions/rpiv-core/index.ts:132-138` — before_agent_start handler-return git injection
- `extensions/rpiv-core/index.ts:174-275` — /rpiv-setup sibling installer
- `extensions/rpiv-core/guidance.ts:52-97` — resolveGuidance per-depth ladder
- `extensions/rpiv-core/guidance.ts:104` — injectedGuidance dedup Set
- `extensions/rpiv-core/guidance.ts:122-152` — injectRootGuidance (session-time)
- `extensions/rpiv-core/guidance.ts:162-192` — handleToolCallGuidance (tool-call time)
- `extensions/rpiv-core/agents.ts:27-33` — PACKAGE_ROOT + BUNDLED_AGENTS_DIR
- `extensions/rpiv-core/agents.ts:94-148` — manifest read/write/bootstrap
- `extensions/rpiv-core/agents.ts:164-297` — syncBundledAgents engine
- `extensions/rpiv-core/agents.ts:285-288` — manifest update rule (detect vs apply)
- `extensions/rpiv-core/git-context.ts:17-20` — module state (cache + lastInjectedSig)
- `extensions/rpiv-core/git-context.ts:33-59` — loadGitContext (parallel rev-parse + user)
- `extensions/rpiv-core/git-context.ts:68-75` — takeGitContextIfChanged
- `extensions/rpiv-core/git-context.ts:77-81` — isGitMutatingCommand regex
- `extensions/rpiv-core/package-checks.ts:33-50` — 5 sibling-presence probes
- `extensions/rpiv-core/pi-installer.ts:18-55` — Windows-safe pi install spawn
- `.rpiv/guidance/architecture.md:26-27,33,44` — stale commands + ladder description
- `.rpiv/guidance/extensions/rpiv-core/architecture.md:4,18-21,28-100,110-116` — largest stale block
- `.rpiv/guidance/skills/architecture.md:8,49,78` — stale tool references
- `.rpiv/guidance/agents/architecture.md:24,59` — stale web-tool references
- `.pi/agents/CLAUDE.md:6,75` — stale "skip-if-exists" agent-sync description
- `agents/web-search-researcher.md:4` — only file in repo declaring `web_search`/`web_fetch`
- `skills/code-review/SKILL.md:44` — only skill naming the `todo` tool explicitly
- `package.json:20` — `files` allowlist (ships extensions, skills, agents, scripts, README)
- `package.json:25-35` — peerDependencies including 5 sibling plugins pinned `"*"`
- `scripts/types.js:1` — orphan `export {};` stub
- `.pi/agents/.rpiv-managed.json` — 9-entry manifest matching source and disk
- `thoughts/shared/designs/2026-04-15_ask-user-question-text-wrapping-fix.md` — misfiled sibling-repo design
- `thoughts/shared/plans/2026-04-15_00-06-55_ask-user-question-wrap-fix.md` — misfiled sibling-repo plan

## Integration Points

### Inbound References

- `package.json:21-24` — Pi loader entry: `"pi": { "extensions": ["./extensions"], "skills": ["./skills"] }`
- `package.json:25-35` — peer-dependency contract with 4 `@juicesharp/rpiv-*` siblings + `@tintinweb/pi-subagents`
- Skills consume the extension's session-start scaffolding (`thoughts/shared/{research,questions,designs,plans,handoffs}` created by `index.ts:44-53`).
- All skills that dispatch subagents consume the 9 `agents/*.md` files synced into `<cwd>/.pi/agents/` (`agents.ts:164` via `index.ts:63,144`).

### Outbound Dependencies

- `@mariozechner/pi-coding-agent` — only non-node runtime import; provides `ExtensionAPI`, `isToolCallEventType`, `pi.exec`, `pi.sendMessage`, `pi.registerCommand`.
- Node built-ins: `node:fs`, `node:path`, `node:url`, `node:os`, `node:child_process`.
- External process: `git` via `pi.exec` (`git-context.ts:36-38,45`); `pi` CLI via `spawn` in `pi-installer.ts:29`.
- Filesystem-only sibling detection reads `~/.pi/agent/settings.json` (`package-checks.ts:15,21-31`).
- No runtime import of any `@juicesharp/rpiv-*` or `@tintinweb/pi-subagents` — detection is filesystem-based only.

### Infrastructure Wiring

- `session_start` (`index.ts:39`) — root guidance inject, thoughts/ scaffold, git context, agent sync, missing-plugin warning.
- `session_compact` (`index.ts:105`) — clear + re-inject root guidance + git context.
- `session_shutdown` (`index.ts:117`) — symmetric state clear.
- `tool_call` (`index.ts:124`) — subfolder guidance resolution + git cache invalidation on mutating bash.
- `before_agent_start` (`index.ts:132`) — conditional git-context return via handler-return contract.
- `session_tree` — **not subscribed** (guidance doc claims it should be).
- `/rpiv-update-agents` command (`index.ts:141`) — `syncBundledAgents(cwd, true)` apply mode.
- `/rpiv-setup` command (`index.ts:174`) — serial `pi install` for missing siblings via `spawnPiInstall`.

## Architecture Insights

- **Pure-orchestrator extension pattern**: rpiv-core owns zero tools and zero runtime sibling imports. All tool surfaces live in the five peer-declared plugins. Detection is filesystem-based (regex over `~/.pi/agent/settings.json`) to avoid runtime coupling.
- **Mark-before-send for guidance injection** (`guidance.ts:139,179-181`): idempotence wins over reliability. A sendMessage failure leaves the path marked-as-injected; preferable to duplicate injection polluting context. Asymmetry at `injectRootGuidance`: mark happens **after** successful readFileSync but **before** sendMessage, so a read-failure stays retryable while a send-failure does not.
- **Detect-only vs apply two-phase manifest sync**: same engine, boolean flag. session_start surfaces drift via `pendingUpdate`/`pendingRemove` without mutating disk; `/rpiv-update-agents` applies. The detect path preserves pending ops in the manifest (`agents.ts:285-288`) so the next apply still knows about them — this is the invariant that regression `0fdfe95` restored.
- **Bootstrap-on-upgrade for manifest**: `bootstrapManifest` (`agents.ts:130-148`) claims only name-collisions with the current bundle, so pre-existing user-authored agents that happen to share a filename get retroactively claimed — truly unique user files stay unmanaged.
- **Two Pi delivery contracts for the same customType**: `pi.sendMessage` (session_start, session_compact) and handler-return `{ message: { ... } }` (before_agent_start). Both route through `takeGitContextIfChanged` which owns the signature state, so whichever fires first claims the value and the other no-ops.
- **Depth-0 skipping in guidance ladder**: `guidance.ts:71-74` deliberately bypasses AGENTS/CLAUDE at depth 0 because Pi's own `resource-loader.js:30-46` already loads them. The shadow tree at `.rpiv/guidance/architecture.md` is checked because Pi's loader does not see it.
- **Windows-safe spawn wrapper** (`pi-installer.ts:21-23`): needed because `@mariozechner/pi-coding-agent`'s `pi.exec` uses `spawn(..., { shell: false })` which cannot launch Windows `.cmd` shims. Pattern to reuse for any future CLI-spawning helper.
- **Legacy aliases coexistence**: `SyncResult.copied`/`skipped` (`agents.ts:62-65`) are maintained alongside richer `added`/`updated`/`removed`/`pendingUpdate`/`pendingRemove`/`unchanged` fields for the back-compat `copyBundledAgents` wrapper (`agents.ts:307-312`).
- **Dispatch-style drift in skills**: `subagent_type:` vs bold-prose "Use the **name** agent" — both name-coupled to sibling frontmatter; visual difference only. No principled reason for the split.

## Developer Context

**Q1 (`extensions/rpiv-core/index.ts:201-206`): `/rpiv-setup` labels advisor "required" and the session-start warning counts it among "5 required siblings missing", but zero bundled skills or agents actually call the advisor tool. How should this be framed?**
A: Advisor stays "required" — it will be actively used in upcoming flow updates. The plugin was added on purpose. The research doc treats the classification as intentional and correct, not a mismatch.

**Q2 (`thoughts/shared/plans/2026-04-13_11-51-36_pi-subagent-context-discipline.md`): `isolated: true` landed on 8/9 `agents/*.md`, but `max_turns:` and `setDefaultMaxTurns(10)` never shipped. Classification?**
A: The feature was rejected. Anything related to this plan is outdated. The partial residue (`isolated: true` on 8/9 agents) is now stale and can be treated as cleanup debt rather than unfinished work.

## Related Research

- Questions source: `thoughts/shared/questions/2026-04-15_14-30-00_rpiv-pi-state-audit.md`
- `thoughts/shared/research/2026-04-13_16-11-41_extract-rpiv-core-tools-into-prerequisite-plugins.md` — preparatory extraction research
- `thoughts/shared/reviews/2026-04-11_design-evaluation-todo-tool-cc-parity.md` — only `reviews/` doc (pre-extraction)

## Open Questions

- Should the cleanup work produced by this audit (guidance sweep, `isolated:` removal, `scripts/types.js` removal, misfiled sibling artifacts relocation, `LICENSE` added to `files` allowlist) land as one bundled PR or split along guidance-vs-code lines? (Not resolved during checkpoint; a future design/plan skill invocation can decide.)
- `session_tree` subscription: wire it, or update the guidance doc to match the current implementation? The doc at `.rpiv/guidance/extensions/rpiv-core/architecture.md:98` is the source of the claim; current code has no state that needs tree-time reconstruction (the state that once did — todo/advisor — is gone), so the doc is the item out of sync.
