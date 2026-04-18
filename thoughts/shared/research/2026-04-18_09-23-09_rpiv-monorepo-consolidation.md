---
date: 2026-04-18T09:23:09-0400
researcher: Claude Code
git_commit: ea7adc063a794e99d1cb0387b9a174e320d7b3d9
branch: main
repository: rpiv-pi
topic: "Organize rpiv-pi and siblings into a local + GitHub monorepo using pi-mono as example"
tags: [research, codebase, monorepo, workspaces, rpiv-pi, siblings, pi-mono, release-pipeline, versioning, rpiv-core]
status: complete
questions_source: "thoughts/shared/questions/2026-04-18_08-45-45_rpiv-monorepo-consolidation.md"
last_updated: 2026-04-18
last_updated_by: Claude Code
---

# Research: Organize rpiv-pi and Siblings into a Monorepo

## Research Question

Organize rpiv-pi and its sibling Pi plugins (`rpiv-advisor`, `rpiv-ask-user-question`, `rpiv-btw`, `rpiv-todo`, `rpiv-web-tools`) into a single local + GitHub monorepo using `badlogic/pi-mono` as a structural example. Preserve customers' current ability to install and update each published sibling independently. Plan for future shared packages (e.g., `rpiv-core`, extracted test-skills) that will introduce the first real cross-package `dependencies` edges.

## Summary

- **Runtime coupling is zero today.** No sibling `import`s another; cross-package binding is declarative only — the `SIBLINGS` registry at `extensions/rpiv-core/siblings.ts:22-53` + `peerDependencies:"*"` at `rpiv-pi/package.json:25-33`. Detection is filesystem-based via a version-agnostic regex over `~/.pi/agent/settings.json` (`package-checks.ts:11`). A monorepo move leaves this wiring intact byte-for-byte.
- **Mechanical consolidation is light.** Per-package edits are `repository.url` / `homepage` / `bugs.url`, and — for 5 siblings — `raw.githubusercontent.com/juicesharp/<name>/main/docs/*.jpg` banner URLs in each README (these will NOT survive repo transfer because GitHub does not redirect `raw.githubusercontent.com`). `rpiv-pi/CHANGELOG.md:62-65` hardcodes four compare/release anchors to the current source repo.
- **`PACKAGE_ROOT` survives.** The three-`dirname()` walk at `agents.ts:27-31` lands on `packages/rpiv-pi/` under workspace-symlink + realpath (Node's default ESM resolution). Fragile against any future `src/` nesting or build step; a marker-file walk (nearest `package.json`) is the robust alternative if that changes.
- **`files` array drift exists today.** `rpiv-advisor/btw/todo/rpiv-pi` declare explicit `files`; `rpiv-ask-user-question` and `rpiv-web-tools` omit it and rely on npm defaults. A shared template must normalize this per-package (root `.npmignore` does not affect workspace packages).
- **Publish precedent is rocky.** The forward extraction `c388ea9` (2026-04-13) required ~2 weeks of follow-up fixes: publish collisions (`1c5ebfa`), late `files` allowlist additions (`40af701`, `b9428e9`), stale peer cleanup (`2150cc4`), Windows `spawn` regression in `/rpiv-setup` (`daf7ee6`). Consolidation should expect the same categories and preflight each tarball with `npm pack` inspection.
- **Decisions recorded** (developer checkpoint): pi-mono `scripts/release.mjs` pipeline with lockstep versions starting at 0.6.0; exclude `rpiv-skillbased`; fresh-init git history (source repos stay live, not archived); caret ranges (`^0.6.0`) for future shared-package deps rewritten on publish; `rpiv-core` extraction is Phase 2.

## Detailed Findings

### Cross-package binding surface (Q1)

The entire coupling between rpiv-pi and its five siblings is **three data structures** plus three consumers:

**Registry** — `extensions/rpiv-core/siblings.ts:13-53`:
- `SiblingPlugin` interface at `siblings.ts:13-20`: `pkg` (install spec), `matches` (case-insensitive regex), `provides` (UI string).
- `SIBLINGS` array at `siblings.ts:22-53`: 6 entries (including `@tintinweb/pi-subagents`).

**Consumers**:
- `readInstalledPackages()` at `package-checks.ts:13-23` reads `~/.pi/agent/settings.json` (`package-checks.ts:11` → `join(homedir(), ".pi", "agent", "settings.json")`).
- `findMissingSiblings()` at `package-checks.ts:30-33`: `SIBLINGS.filter(s => !installed.some(entry => s.matches.test(entry)))`. No version check, no `node_modules` read.
- `buildConfirmBody()` + `installMissing()` at `setup-command.ts:32-95`. Install loops serially via `spawnPiInstall()` at `pi-installer.ts:18-55` — invokes `pi install <pkg>` out-of-process.
- `warnMissingSiblings()` at `session-hooks.ts:113-120`, wired to `session_start` at `session-hooks.ts:49`, gated on `ctx.hasUI`.

**peerDependencies surface** — `rpiv-pi/package.json:25-33`: seven entries pinned to `"*"`. The only one rpiv-core actually imports is `@mariozechner/pi-coding-agent` (at `index.ts:10`). The five `@juicesharp/rpiv-*` peers carry zero code-import weight.

**Zero-cross-imports — confirmed**: grep across all six sibling source trees shows `@juicesharp/rpiv-*` appears only in `package.json:name`, README install snippets, `rpiv-pi/siblings.ts` string literals, and `rpiv-btw`'s JSDoc header at `btw.ts:2` / `index.ts:2` (not `import` specifiers). Every real `import` targets `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`, `@sinclair/typebox`, `node:*`, or relative internals.

### pi-mono structural template comparison (Q2)

**Adopt verbatim**: root `package.json` with `"workspaces": ["packages/*"]`; `scripts/release.mjs` skeleton (it already understands the `## [Unreleased]` anchor at `rpiv-pi/CHANGELOG.md:8`); root `.gitignore`; root `LICENSE`; root `biome.json`.

**Adapt**: `tsconfig.base.json` for IDE typechecking only. Per-package `tsconfig.json` becomes a two-line `{ "extends": "../../tsconfig.base.json", "include": [...] }`. Husky/lefthook hooks limited to pre-commit Biome + `tsc --noEmit`.

**Skip** (no build step): `tsconfig.build.json`, `vitest.config.ts`, `dist/`, `tsgo`, `prepublishOnly: tsc -b`, `exports` maps, `build-binaries.yml`, nested example workspaces. Pi loads `.ts` directly via `@mariozechner/jiti`; `files` ships source, not compiled output.

**`scripts/sync-versions.js`**: pi-mono uses it to sync `workspace:*` specifiers to pinned exact versions at publish. Adapted here to rewrite **caret ranges** (`^0.6.0`) instead of exact pins — see Q4.

### Versioning model (Q3)

Current diverged state (each `package.json:3`):
- `rpiv-pi@0.6.0`, `rpiv-advisor@0.1.3`, `rpiv-ask-user-question@0.1.4`, `rpiv-btw@0.1.1`, `rpiv-todo@0.1.2`, `rpiv-web-tools@0.1.2`.
- Only `rpiv-pi/CHANGELOG.md` exists at repo level; the other five have no CHANGELOG.

**Lockstep is runtime-invisible downstream**: the `matches` regex at `siblings.ts:25,30,35,40,45,50` and the `peerDependencies:"*"` at `package.json:26-32` are both version-agnostic; `spawnPiInstall()` at `pi-installer.ts:22-23` passes `pkg` with no version tag. A lockstep bump causes cosmetic version advancement for packages whose code didn't change, but every runtime code path is unaffected.

### Inter-package reference protocol (Q4)

`/rpiv-setup` flow is node_modules-independent:
1. `setup-command.ts:52` → `findMissingSiblings()` → `package-checks.ts:13-23` reads `~/.pi/agent/settings.json`.
2. `setup-command.ts:70-95` → `spawnPiInstall()` invokes `pi install` as a child process; Pi writes to `~/.pi/agent/settings.json`, **not** the repo's `node_modules/`.
3. Next session, `session-hooks.ts:113-120` re-reads the same settings file.

Monorepo developer's workspace layout and end user's settings path are disjoint. Decision (see Developer Context): caret ranges `^0.6.0` rewritten on publish by a `sync-versions.js` clone. Workspace-local dev uses npm workspace symlinks; published tarballs carry caret ranges that deduplicate cleanly.

### GitHub consolidation (Q5)

Local tag inventory is sparse: `rpiv-pi` has `v0.5.0/v0.5.1/v0.6.0`; `rpiv-btw` has `v0.1.1`; others have no local tags. Remote-only tags (rpiv-pi v0.2.0/0.3.0/0.4.x and sibling v0.1.x) depend on GitHub origin state not audited here.

Per-package rewrites required on move:

| Repo | `package.json` lines | CHANGELOG | README raw image |
|---|---|---|---|
| rpiv-pi | `:11`, `:13`, `:15` | `:62-65` (4 compare/release anchors) | none |
| rpiv-advisor | `:11`, `:13`, `:15` | absent | `README.md:8` |
| rpiv-ask-user-question | `:11`, `:13`, `:15` | absent | `README.md:7` |
| rpiv-btw | `:11`, `:13`, `:15` | absent | `README.md:8` |
| rpiv-todo | `:16`, `:18`, `:20` | absent | `README.md:7` |
| rpiv-web-tools | `:11`, `:13`, `:15` | absent | `README.md:7` |

`raw.githubusercontent.com/juicesharp/<name>/main/...` URLs will NOT survive repo transfer — GitHub does not redirect the raw domain. All five must be rewritten to the monorepo equivalent.

Runtime stability: `siblings.ts:22-53` references `npm:@juicesharp/*` specs only; no GitHub URLs anywhere in code. Package names stay stable → `/rpiv-setup` and `session_start` warnings unaffected.

### Root-vs-package config ownership (Q6)

**Move to monorepo root**: single `LICENSE`, unified `.gitignore` (replaces four divergent copies — `rpiv-pi/.gitignore:1-6`, `rpiv-advisor/.gitignore:1-7`, `rpiv-btw/.gitignore:1-3`, `rpiv-todo/.gitignore:1-7`), `tsconfig.base.json`, `biome.json`, `.husky/`, root `package.json` (`"private": true` + `workspaces` + dev scripts).

**Stay per-package**: `README.md`, `CHANGELOG.md`, `package.json` (`name`/`version`/`pi`/`peerDependencies`/`files`), `prompts/*.txt` (`rpiv-advisor/prompts/advisor-system.txt`, `rpiv-btw/prompts/btw-system.txt`), `docs/<name>.jpg` banner, per-package minimal `tsconfig.json` extending `../../tsconfig.base.json`.

**Skip**: `tsconfig.build.json`, `vitest.config.ts`, `dist/`.

**`files` normalization**: must add explicit `files` arrays to `rpiv-ask-user-question` and `rpiv-web-tools` (currently absent; rely on npm defaults). Remove redundant `"LICENSE"` entries from `rpiv-btw/package.json:26` and `rpiv-pi/package.json:20` once root LICENSE is hoisted by npm workspace publish.

### PACKAGE_ROOT under monorepo (Q7)

`PACKAGE_ROOT` derivation at `agents.ts:27-31`:
```
export const PACKAGE_ROOT = (() => {
    const thisFile = fileURLToPath(import.meta.url);
    return dirname(dirname(dirname(thisFile)));
})();
```
Strips `agents.ts`, `rpiv-core/`, `extensions/` → lands on package root. `BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents")` at `agents.ts:33`.

**Simulations**:
- Published tarball: `node_modules/@juicesharp/rpiv-pi/extensions/rpiv-core/agents.ts` → three dirnames → `node_modules/@juicesharp/rpiv-pi/` (contains `agents/` per `package.json:20` `files`). **Works.**
- Workspace symlink: Node ESM default realpath's symlinks → `import.meta.url` resolves to `/repo/packages/rpiv-pi/extensions/rpiv-core/agents.ts` → three dirnames → `/repo/packages/rpiv-pi/`. **Works** (no `--preserve-symlinks` anywhere in the repo).
- Direct in-monorepo execution: identical to workspace case. **Works.**

**Fragility**:
- Build step emitting `dist/` breaks the walk (one level different).
- Any `src/` nesting breaks the walk.
- Hoisting `agents/` to monorepo root would require abandoning `PACKAGE_ROOT`-based resolution entirely.

Siblings with similar patterns (`rpiv-advisor/advisor.ts:137-140`, `rpiv-btw/btw.ts:77-80`) use `new URL("./prompts/...", import.meta.url)` — depth-agnostic, safer. Consider porting rpiv-pi's agents.ts to the same pattern if any future refactor nests `agents.ts` deeper.

### rpiv-skillbased inclusion (Q8)

**Excluded** per Developer Context decision below. Mechanical blockers justify exclusion independent of policy:
- `package.json` is `{ "type": "module" }` only at `/Users/sguslystyi/rpiv-skillbased/package.json:1` — no `name`, can't `npm publish`.
- `.git/config:11` points at `repos.truvisibility.com/truvis/rpiv-next.git` (not juicesharp).
- `README.md:3` declares Claude Code host; `/Users/sguslystyi/rpiv-skillbased/README.md:19-48` uses CC plugin-namespace slash commands.
- Frontmatter divergence: agent `tools:` lists capitalised CC names (`Grep, Glob, LS` at `skillbased/agents/codebase-locator.md:4`) vs Pi lowercase (`grep, find, ls` at `rpiv-pi/agents/codebase-locator.md:4`). Bodies ~95% identical but frontmatter and embedded tool-call syntax (CC `AskUserQuestion` YAML blocks vs Pi `ask_user_question` prose) are incompatible.

### Publish pipeline (Q9)

**pi-mono's `scripts/release.mjs` selected.** Auto-promotes `## [Unreleased]` at `rpiv-pi/CHANGELOG.md:8` to a versioned header, preserves Keep-a-Changelog prose at lines 3-6 and em-dash dates at lines 10/15/20 byte-for-byte, writes new compare link at bottom matching `CHANGELOG.md:62-65` pattern. Local-run on maintainer laptop — no CI secrets required; CI stays typecheck + Biome only. `scripts/` at monorepo root is collision-free because `rpiv-pi/scripts/migrate.js` is a runtime-shipped script (listed in `rpiv-pi/package.json:20` `files` as `"scripts/"`) and stays inside `packages/rpiv-pi/scripts/`.

## Code References

- `extensions/rpiv-core/siblings.ts:13-53` — SiblingPlugin interface + SIBLINGS array
- `extensions/rpiv-core/package-checks.ts:11-33` — settings path + readInstalledPackages + findMissingSiblings
- `extensions/rpiv-core/setup-command.ts:32-95` — buildConfirmBody + handler + installMissing
- `extensions/rpiv-core/pi-installer.ts:18-55` — spawnPiInstall (Windows-safe)
- `extensions/rpiv-core/session-hooks.ts:47-49,113-120` — session_start hook + warnMissingSiblings
- `extensions/rpiv-core/agents.ts:27-33` — PACKAGE_ROOT + BUNDLED_AGENTS_DIR
- `extensions/rpiv-core/agents.ts:79-111,156-278` — manifest read/write + syncBundledAgents
- `extensions/rpiv-core/update-agents-command.ts:7,21` — /rpiv-update-agents handler
- `extensions/rpiv-core/index.ts:10` — only runtime import of a @mariozechner package
- `package.json:20` — rpiv-pi files allowlist (extensions/ skills/ agents/ scripts/ README.md LICENSE)
- `package.json:25-33` — rpiv-pi peerDependencies (7 entries, all "*")
- `CHANGELOG.md:8` — `## [Unreleased]` marker release.mjs targets
- `CHANGELOG.md:62-65` — hardcoded github.com/juicesharp/rpiv-pi/compare + releases/tag anchors
- `/Users/sguslystyi/rpiv-advisor/advisor.ts:137-140` — depth-agnostic prompt-load pattern
- `/Users/sguslystyi/rpiv-btw/btw.ts:77-80` — same depth-agnostic pattern
- `/Users/sguslystyi/rpiv-advisor/package.json:20-26` — explicit files array (template)
- `/Users/sguslystyi/rpiv-ask-user-question/package.json:17-20` — missing files array
- `/Users/sguslystyi/rpiv-web-tools/package.json:17-20` — missing files array

## Integration Points

### Inbound References

- Pi extension host — loads via `rpiv-pi/package.json:22` (`"extensions": ["./extensions"]`); calls `extensions/rpiv-core/index.ts` default export at session start.
- Pi skills host — loads via `rpiv-pi/package.json:23` (`"skills": ["./skills"]`); reads `SKILL.md` in each folder.
- User invocation — `/rpiv-setup`, `/rpiv-update-agents`, `/skill:<name>` (per root CLAUDE.md).
- Sibling invocations (post-install) — `/todos`, `/advisor`, `/web-search-config`, `/btw` registered by their own packages.

### Outbound Dependencies

- `@mariozechner/pi-coding-agent` — only runtime import (rpiv-core/index.ts:10); ExtensionAPI + isToolCallEventType.
- Node built-ins — `node:fs`, `node:path`, `node:url`, `node:os`, `node:child_process`.
- External processes — `git` (via `pi.exec` in git-context.ts); `pi` CLI (via `spawn` in pi-installer.ts).
- Sibling npm specs — `npm:@juicesharp/rpiv-*` strings in `siblings.ts:22-53` (data only, not imports).

### Infrastructure Wiring

- `package.json:22-24` — `pi.extensions` + `pi.skills` manifest discovery
- `package.json:20` — `files` allowlist controls tarball contents
- `rpiv-pi/.gitignore:1-6` — current ignore set (to be unified at monorepo root)
- `extensions/rpiv-core/index.ts` — three-register composer (session-hooks, setup-command, update-agents-command)

## Architecture Insights

- **Declarative-registry + out-of-process installer** keeps the runtime coupling orthogonal to workspace layout. `~/.pi/agent/settings.json` is the only shared state between detection (`package-checks.ts:11`) and install (`pi-installer.ts` → `pi install <pkg>` → Pi writes settings). The monorepo developer's `node_modules/` layout is invisible to this path.
- **Version-agnostic everywhere**: regex in `siblings.ts:25-51`, `"*"` peers in `package.json:26-32`, `pi install` without version suffix in `pi-installer.ts:22-23`. Lockstep versioning is a publish-time convention; runtime cares only about package names.
- **`files` whitelist is the packaging contract.** rpiv-pi's `package.json:20` lists `extensions/ skills/ agents/ scripts/` — the four directories that together make the package work. Any monorepo publish script must reproduce this per-package, not rely on a root `.npmignore`.
- **Pi loads raw TypeScript** (no build step anywhere in any sibling). Eliminates an entire class of `dist/` / `tsconfig.build.json` / `exports` complexity that pi-mono carries. Monorepo tooling is simpler than pi-mono as a result.
- **Zero cross-imports today** means the monorepo move is mechanical-only in Phase 1. The first real `dependencies` edge (Phase 2 `rpiv-core` extraction, or Phase 3 test-skills extraction) is when pattern changes — and is when the caret-range protocol starts paying off.
- **Agents sync is a single-writer invariant** (per prior research at `thoughts/shared/research/2026-04-16_11-39-33_extract-test-cases-sibling-plugin.md`). Only rpiv-pi (or a future extracted rpiv-core) may own `syncBundledAgents`. Multiple writers on `<cwd>/.pi/agents/.rpiv-managed.json` would alternately overwrite each other's manifest.

## Precedents & Lessons

6 precedent clusters analyzed. Key commits:

- `c388ea9` — forward extraction of tools into siblings (2026-04-13); the reverse of what we're doing.
- `32eaf33` — per-concern registrar split + SIBLINGS registry introduction (2026-04-15).
- `b562056` + `0fdfe95` — syncBundledAgents + same-day manifest bugfix (2026-04-14).
- `761f2e9` + `a02f709` + `ec29de1` — scope rename, LICENSE, publish metadata churn.
- `daf7ee6` — `/rpiv-setup` Windows spawn regression introduced `pi-installer.ts` (2026-04-14).
- `1c5ebfa` — publish collision (0.4.3 already on registry, republished as 0.4.4).

**Composite lessons:**
- **Follow-up publish errors are the recurring pattern.** Version bumps historically took 2–3 tries per package; `files` allowlist fixes landed weeks after initial publish (`40af701`, `b9428e9`). Preflight `npm pack` for every package before the first monorepo publish.
- **`files` allowlist is the highest-risk per-package field.** Three of six siblings shipped tarballs with wrong contents because `files` was missing or incomplete. Normalize all six manifests up front.
- **`SIBLINGS` regex + `"*"` peers + `~/.pi/agent/settings.json` detection are monorepo-transparent.** No code change needed in `siblings.ts`, `package-checks.ts`, `session-hooks.ts`, `setup-command.ts`, or `pi-installer.ts` for the move.
- **`PACKAGE_ROOT` arithmetic survives `packages/rpiv-pi/`** but is fragile against future `src/` nesting or a build step. Consider porting to `new URL("./agents/", import.meta.url)` pattern used by advisor/btw.
- **Tool/command name preservation is non-negotiable** — `todo`, `advisor`, `ask_user_question`, `web_search`, `web_fetch`, `/todos`, `/advisor`, `/web-search-config`, `/btw`, `/rpiv-setup`, `/rpiv-update-agents` are contracts across skill prose, permission files, branch-replay filters, and overlay refresh.
- **Windows `spawn` has bitten this codebase.** Any new `scripts/release.mjs` must be tested on Windows or declared Unix-only.
- **Guidance docs drift after structural changes** (`189a669` synced architecture.md post-refactor). Consolidation must update `.rpiv/guidance/**/architecture.md` and `CLAUDE.md` in the same or immediately-following commit.
- **No prior monorepo attempts = no scar tissue.** Greenfield consolidation, but also no precedent-tested shape — first release will be the learning release.

## Historical Context (from thoughts/)

- `thoughts/shared/questions/2026-04-18_08-45-45_rpiv-monorepo-consolidation.md` — the 9-question source artifact this research answers.
- `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md` — the forward-extraction design; tool-name and command-name contracts carry forward.
- `thoughts/shared/plans/2026-04-13_17-52-15_extract-rpiv-plugins.md` — flat per-sibling layout (no `extensions/<name>/` subdir) established by extraction; monorepo inherits this shape.
- `thoughts/shared/research/2026-04-13_16-11-41_extract-rpiv-core-tools-into-prerequisite-plugins.md` — baseline research predating the extraction.
- `thoughts/shared/research/2026-04-16_11-39-33_extract-test-cases-sibling-plugin.md` — single-writer constraint on `.rpiv-managed.json`; relevant to Phase 3 test-skills extraction.
- `thoughts/shared/plans/2026-04-14_11-56-40_agent-sync-refactor.md` — context for `syncBundledAgents` + manifest engine.

## Developer Context

**Q (`rpiv-pi/CHANGELOG.md:3-6,62-65` + pi-mono `scripts/release.mjs`): Publish pipeline choice — pi-mono release.mjs, Changesets, or status quo?**
A: **pi-mono release.mjs.** Preserves Keep-a-Changelog prose verbatim; auto-promotes `## [Unreleased]` marker. No CI secrets required. Lockstep version bumps across all packages.

**Q (`rpiv-skillbased/package.json:1` + `.git/config:11`): rpiv-skillbased inclusion — exclude, include private, or dedupe into shared skills package?**
A: **Exclude.** Keeps rpiv-skillbased at its truvis remote as a CC-host reference bundle. Monorepo scope is Pi-only, publishable-only. Matches standing memory note.

**Q (six diverged versions across each sibling's `package.json:3`): Lockstep starting version — align at 0.6.0, reset to 1.0.0, or align at 0.7.0?**
A: **Align all at 0.6.0; next release is 0.6.1.** rpiv-pi keeps its existing CHANGELOG trunk; siblings jump from 0.1.x to 0.6.0 as the consolidation signal.

**Q (git history strategy): Subtree, filter-repo, fresh-init, or archive sources?**
A: **Fresh init.** History reset is acceptable; source repos stay live (not archived). Simplest; no squash commits, no 6 roots in log. Source repos remain available as forks-of-record.

**Q (future shared-package dep protocol): Exact-pin (pi-mono default), caret range, `workspace:*`-stripped, or keep `"*"` peers?**
A: **Caret ranges (`^0.6.0`) rewritten on publish by a sync-versions.js clone.** Under lockstep, carets always resolve to the newest lockstep version; customers who update one sibling get the highest satisfying shared-infra version and npm deduplicates. Preserves independent install/update ability for every published package.

**Q (phasing): When does `rpiv-core` extraction happen?**
A: **Phase 2.** Phase 1 = consolidation with today's zero-cross-imports shape intact (6 packages into `packages/*`). Phase 2 = extract shared infra (`siblings.ts`, `package-checks.ts`, `setup-command.ts`, `session-hooks.ts`, `pi-installer.ts`, `agents.ts`, `guidance.ts`, `git-context.ts`) into `packages/rpiv-core/`; rpiv-pi becomes a thin shim depending on `@juicesharp/rpiv-core`. Phase 3 = test-skills extraction (if pursued) also depends on rpiv-core.

## Related Research

- Questions source: `thoughts/shared/questions/2026-04-18_08-45-45_rpiv-monorepo-consolidation.md`
- Prior extraction research: `thoughts/shared/research/2026-04-13_16-11-41_extract-rpiv-core-tools-into-prerequisite-plugins.md`
- Single-writer manifest constraint: `thoughts/shared/research/2026-04-16_11-39-33_extract-test-cases-sibling-plugin.md`

## Open Questions

- **GitHub repo name** — `rpiv-monorepo`, `rpiv`, `juicesharp-rpiv`, or repurpose `juicesharp/rpiv-pi`? Defer to naming convention preference at PR time.
- **Source-repo fate on GitHub** — stay live with a pinned README pointer to the monorepo, or leave unchanged? Decision required before first monorepo publish so downstream issue-trackers know where to file.
- **Windows release.mjs support** — `daf7ee6` precedent suggests Windows spawn hazards. Adopt pi-mono's release.mjs as-is (Unix-first) or port upfront? Defer until first Windows maintainer surfaces.
- **Per-sibling CHANGELOG seeding** — lockstep release.mjs expects `## [Unreleased]` in every package. Seed five missing CHANGELOGs (advisor/ask-user-question/btw/todo/web-tools) with a single historical entry at their current published version, or start fresh at 0.6.0 with no back-history? Recommend the latter for simplicity.
- **`PACKAGE_ROOT` modernization** — port `agents.ts:27-31` to the `new URL("./agents/", import.meta.url)` pattern used by advisor/btw pre-emptively, or leave until a refactor forces it? Low-risk pre-emptive change recommended.
