---
date: 2026-04-16T11:39:33-0400
researcher: Sergii
git_commit: d271bdd
branch: main
repository: rpiv-pi
topic: "Extract QA test-case skills into optional sibling plugin"
tags: [research, test-cases, sibling-plugin, optional-plugin, extraction, outline-test-cases, write-test-cases, test-case-locator]
status: complete
questions_source: "thoughts/shared/questions/2026-04-16_09-37-15_extract-test-cases-sibling-plugin.md"
last_updated: 2026-04-16
last_updated_by: Sergii
---

# Research: Extract QA Test-Case Skills into Optional Sibling Plugin

## Research Question

Investigate options for extracting QA test-case skills (`outline-test-cases`, `write-test-cases`) and the `test-case-locator` agent into an optional sibling plugin like `@juicesharp/rpiv-advisor` et al., making it independently installable.

## Summary

The test-case subsystem is a cleanly bounded, self-contained triad: 2 skills + 1 agent, forming a closed loop with zero inbound references from other skills, agents, or extensions. Extraction is architecturally straightforward — the sibling package is skills-only (no extension, no session hooks), with the `test-case-locator` agent remaining in rpiv-pi to avoid manifest conflicts in the agent-sync system. The plugin is truly optional: no `SIBLINGS` entry, no `peerDependencies` in rpiv-pi, no session-start warning. Users discover it via docs and install with `pi install npm:@juicesharp/rpiv-test-cases`.

**Three developer decisions were made:**
1. **Agent stays in rpiv-pi** — avoids manifest conflict in `.rpiv-managed.json` (single-writer flat array at `agents.ts:237-241`); sibling is skills-only
2. **Truly optional** — no `SIBLINGS` entry, no `peerDependencies` in rpiv-pi, no warning; user discovers via README/docs
3. **`@juicesharp/rpiv-pi` as peer dependency of sibling** — explicit declaration since skills dispatch rpiv-pi agents (`codebase-locator`, `codebase-analyzer`, `integration-scanner`)

## Detailed Findings

### Sibling Registration and Optional Semantics (Q1, Q6, Q9)

The `SIBLINGS` array (`siblings.ts:22-48`) is the single source of truth for three consumers: `findMissingSiblings()` in `package-checks.ts:29-32`, `warnMissingSiblings()` in `session-hooks.ts:113-121`, and `installMissing()` in `setup-command.ts:70-92`. A sibling not in `SIBLINGS` is **invisible to all four code paths** — no detection, no warning, no install offer.

npm `peerDependencies` does NOT support `"optional": true` (that's `optionalDependencies` for regular deps). Listing test-cases as a `peerDependency` of rpiv-pi would cause npm warnings when it's not installed — contradicting "optional" semantics. The correct approach is omitting it from both `SIBLINGS` and `peerDependencies`.

Pi's extension host loads all installed packages independently from `~/.pi/agent/settings.json` (`package-checks.ts:14-22`). There is no requirement for a `peerDependency` relationship between packages — each package's `"pi"` manifest declares its own resources independently. A separately installed `@juicesharp/rpiv-test-cases` would have its skills discovered regardless of whether rpiv-pi lists it.

**No "recommended but optional" mechanism exists** — the `SiblingPlugin` interface (`siblings.ts:13-19`) has only `pkg`, `matches`, `provides`. No `optional`, `recommended`, or severity field exists. Creating one would require interface changes + consumer changes (warnMissingSiblings severity, buildConfirmBody language).

### Agent Sync Architecture (Q2, Q3)

The agent sync system (`agents.ts`) is `PACKAGE_ROOT`-bound:
- `PACKAGE_ROOT` resolved via `import.meta.url` + 3 `dirname()` calls (`agents.ts:27-31`)
- `BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents")` (`agents.ts:33`)
- `syncBundledAgents()` reads only from this fixed path (`agents.ts:156-267`)

The manifest `.rpiv-managed.json` is a **single flat JSON array** that gets **replaced entirely** on each write (`agents.ts:237-241`). If two packages both ran sync against the same `<cwd>/.pi/agents/`, they would alternately overwrite each other's manifest entries and eventually delete each other's agents on `apply=true`.

**Decision: Agent stays in rpiv-pi.** The `test-case-locator.md` remains in rpiv-pi's `agents/` directory. It syncs via the existing mechanism regardless of whether the sibling is installed. When the sibling is not installed, the agent is present but unused — harmless. The sibling is skills-only with no `extensions/` directory and no session hooks.

Pi's agent resolution is **file-based**, not package-based. It reads `<cwd>/.pi/agents/<name>.md`. Once `test-case-locator.md` exists there (synced by rpiv-pi), any skill from any package can reference it via `subagent_type: "test-case-locator"`.

### Skill-to-Skill Contract and Templates (Q4)

The inter-skill contract is **file-format-based** via `_meta.md`:
- `outline-test-cases` **creates** `_meta.md` per feature (`SKILL.md:238-248`, template at `templates/feature-meta.md:1-8`)
- `write-test-cases` **reads** `_meta.md` as warm-start (`SKILL.md:26-39`), extracting: feature, module, portal, slug, Routes, Endpoints, Scope Decisions, Domain Context, Checkpoint History
- `write-test-cases` **updates** `_meta.md` frontmatter (`SKILL.md:252`): sets `tc_count`, `status: generated`, `generated` date

Both skills reference templates via **bare relative paths** (e.g., `templates/feature-meta.md`) resolved relative to the skill's directory. Templates must travel with their SKILL.md — the relative paths continue working after extraction since both skills move together.

The `_meta.md` contract works across package boundaries because it lives in the target project's `.rpiv/test-cases/{slug}/`, not in either plugin's directory.

### Agent Dependencies from Sibling to rpiv-pi (Q3, Q8)

The extracted skills dispatch agents that stay in rpiv-pi:
- `outline-test-cases` spawns: `codebase-locator` (×3), `test-case-locator` (×1) (`SKILL.md:54-58`)
- `write-test-cases` spawns: `codebase-locator`, `test-case-locator`, `codebase-analyzer`, `integration-scanner` (`SKILL.md:80-83`)

Only `test-case-locator` is QA-specific. The other 3 are general-purpose agents in rpiv-pi. They work because rpiv-pi syncs them to `.pi/agents/` at session start. The sibling's `peerDependencies` should declare `@juicesharp/rpiv-pi` to make this dependency explicit.

### Package Structure (Q5, Q8)

The sibling is a **skills-only Pi package** — no `extensions/`, no session hooks, no commands.

```json
{
  "name": "@juicesharp/rpiv-test-cases",
  "version": "0.1.0",
  "description": "QA test-case skills for Pi Agent — outline-test-cases and write-test-cases",
  "keywords": ["pi-package", "pi-extension", "rpiv", "test-cases", "qa"],
  "license": "MIT",
  "author": "juicesharp",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/juicesharp/rpiv-test-cases.git"
  },
  "publishConfig": { "access": "public" },
  "files": ["skills/", "README.md", "LICENSE"],
  "pi": {
    "skills": ["./skills"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@tintinweb/pi-subagents": "*",
    "@juicesharp/rpiv-ask-user-question": "*",
    "@juicesharp/rpiv-pi": "*"
  }
}
```

Key decisions reflected:
- No `"extensions"` in `"pi"` — skills-only package
- `@juicesharp/rpiv-pi` as peer — skills dispatch rpiv-pi agents
- `@juicesharp/rpiv-ask-user-question` as peer — both skills use `ask_user_question` for checkpoints
- `@tintinweb/pi-subagents` as peer — provides `Agent` tool for subagent dispatch
- No `@juicesharp/rpiv-web-tools` — `test-case-locator` only uses `grep, find, ls` (`test-case-locator.md:4`)
- No `@juicesharp/rpiv-todo` or `@juicesharp/rpiv-advisor` — not used

Pi discovers skills per-package from each installed package's `"pi"."skills"` field (`packages.md:57-66`). Each package has separate module roots (`packages.md:163`). Skills from multiple packages merge into a flat namespace with no collision.

### Extraction Inventory (Q7)

**13 files move** to the sibling repo:
- `skills/outline-test-cases/SKILL.md` + `templates/feature-meta.md` + `templates/outline-readme.md` (3 files)
- `skills/write-test-cases/SKILL.md` + `templates/{test-case,regression-suite,coverage-map}.md` + `examples/{order-placement-flow,customer-auth-flow,team-management-flow,order-management-suite,team-management-suite}.md` (9 files)
- `agents/test-case-locator.md` (1 file) — **stays in rpiv-pi per decision**

Wait — correction: per the "agent stays in rpiv-pi" decision, only **12 files move** (the 12 skill files). `test-case-locator.md` stays.

**5 files in rpiv-pi get minor updates:**
- `README.md:121-122,162` — remove test-case skill rows and agent row (3 lines)
- `.rpiv/guidance/skills/architecture.md:22` — remove `outline-test-cases/, write-test-cases/` line
- `.rpiv/guidance/agents/architecture.md:19` — remove `test-case-locator.md` from locator list
- `.pi/agents/.rpiv-managed.json` — `test-case-locator.md` entry stays (agent doesn't move)
- `.pi/agents/CLAUDE.md:19` — same edit as agents/architecture.md

**Zero TypeScript code changes** in `extensions/rpiv-core/` — confirmed by grep returning no matches for `test-case|outline-test|write-test` across all `.ts` files.

### Optional Install User Experience (Q9)

**Without the sibling:**
1. User runs `pi install npm:@juicesharp/rpiv-pi` + `/rpiv-setup`
2. Session starts — no test-cases warning (not in `SIBLINGS`)
3. `/skill:outline-test-cases` and `/skill:write-test-cases` are **absent** from skill menu
4. `test-case-locator.md` is synced to `.pi/agents/` by rpiv-pi (harmless dead agent)

**To add test-cases:**
1. User runs `pi install npm:@juicesharp/rpiv-test-cases`
2. On next session, Pi discovers skills from both packages
3. `/skill:outline-test-cases` and `/skill:write-test-cases` appear in skill menu
4. Skills dispatch agents that are already in `.pi/agents/` (synced by rpiv-pi)

## Code References

- `extensions/rpiv-core/siblings.ts:13-19` — `SiblingPlugin` interface (pkg, matches, provides)
- `extensions/rpiv-core/siblings.ts:22-48` — `SIBLINGS` array (5 entries, no test-cases)
- `extensions/rpiv-core/agents.ts:27-33` — PACKAGE_ROOT resolution (3 dirname calls, BUNDLED_AGENTS_DIR)
- `extensions/rpiv-core/agents.ts:156-267` — `syncBundledAgents()` full algorithm
- `extensions/rpiv-core/agents.ts:237-241` — manifest write (replace, not merge)
- `extensions/rpiv-core/session-hooks.ts:39-51` — session_start handler (agent sync + sibling warning)
- `extensions/rpiv-core/session-hooks.ts:113-121` — `warnMissingSiblings()` (reads SIBLINGS)
- `extensions/rpiv-core/package-checks.ts:14-22` — `readInstalledPackages()` (settings.json)
- `extensions/rpiv-core/package-checks.ts:29-32` — `findMissingSiblings()` (filters SIBLINGS)
- `extensions/rpiv-core/setup-command.ts:37-43` — `buildConfirmBody()` (shows "required — provides")
- `extensions/rpiv-core/setup-command.ts:70-92` — `installMissing()` (serial pi install loop)
- `package.json:29-32` — `"pi": { "extensions": [...], "skills": [...] }` manifest
- `package.json:42-48` — `peerDependencies` (5 siblings + pi-coding-agent)
- `skills/outline-test-cases/SKILL.md:5` — `allowed-tools: Agent, Read, Write, Edit, Glob, Grep`
- `skills/outline-test-cases/SKILL.md:54-58` — spawns codebase-locator (×3), test-case-locator (×1)
- `skills/outline-test-cases/SKILL.md:238-248` — creates `_meta.md` from `templates/feature-meta.md`
- `skills/write-test-cases/SKILL.md:26-39` — reads `_meta.md` as warm-start
- `skills/write-test-cases/SKILL.md:80-83` — spawns codebase-locator, test-case-locator, codebase-analyzer, integration-scanner
- `skills/write-test-cases/SKILL.md:252` — updates `_meta.md` frontmatter (tc_count, status, generated)
- `agents/test-case-locator.md:4-5` — `tools: grep, find, ls` / `isolated: true`
- `.rpiv/guidance/skills/architecture.md:22` — lists `outline-test-cases/, write-test-cases/`
- `.rpiv/guidance/agents/architecture.md:19` — lists `test-case-locator.md` among locators
- `README.md:121-122,162` — skill and agent table rows for test-cases

## Integration Points

### Inbound References
- **Zero** — no other skill, agent, or extension references test-case skills or the test-case-locator agent. The subsystem is a closed loop.

### Outbound Dependencies
- `skills/outline-test-cases/SKILL.md:54-58` — dispatches `codebase-locator` agent (rpiv-pi)
- `skills/write-test-cases/SKILL.md:80-83` — dispatches `codebase-locator`, `codebase-analyzer`, `integration-scanner` agents (all rpiv-pi)
- `skills/outline-test-cases/SKILL.md:135,185,218,224` — uses `ask_user_question` tool (rpiv-ask-user-question)
- `skills/write-test-cases/SKILL.md:177,182` — uses `ask_user_question` tool (rpiv-ask-user-question)
- Both skills use `Agent` tool (pi-subagents) for all agent dispatch

### Infrastructure Wiring
- `extensions/rpiv-core/session-hooks.ts:48` — `syncBundledAgents()` will continue syncing `test-case-locator.md` from rpiv-pi's `agents/` directory
- `~/.pi/agent/settings.json` — Pi discovers the sibling package's skills via its own `"pi"."skills"` manifest

## Architecture Insights

1. **`SIBLINGS` is binary** — a sibling is either required (warned about, auto-installed) or invisible. No "recommended" tier exists. The test-case extraction leverages this by simply omitting it.

2. **Agent sync is single-writer** — the manifest replacement pattern (`agents.ts:237-241`) means only one package can own `.rpiv-managed.json`. The "agent stays in rpiv-pi" decision sidesteps this entirely.

3. **File-format contracts survive package boundaries** — the `_meta.md` inter-skill contract is purely structural markdown with YAML frontmatter. It lives in the target project's `.rpiv/test-cases/`, not in either plugin's directory. Both skills can read/write it regardless of which package owns them.

4. **Template paths are skill-relative** — bare relative paths like `templates/feature-meta.md` resolve relative to the SKILL.md's directory. Moving the entire skill folder preserves this resolution. No absolute path updates needed.

5. **Pi loads packages independently** — each package's `"pi"` manifest is read separately. Skills from multiple packages merge into a flat namespace. No conflict even with identical directory structure (`skills/outline-test-cases/` in both packages would be a problem, but the files move out of rpiv-pi).

6. **Optional peers work in Pi** — Pi discovers packages from `settings.json`, not from `peerDependencies`. A package not declared as a peer of rpiv-pi still has its skills loaded if installed.

## Precedents & Lessons

4 similar past changes analyzed. Key commits:

- `c388ea9` — "Extract tools into @juicesharp Pi plugins; bump to 0.4.0" (2026-04-13): 13 follow-up fixes in 2 days. Agent sync was rewritten from scratch (`b562056`), had a manifest bug (`0fdfe95`), and required a Windows spawn fix (`daf7ee6`).
- `32eaf33` — "refactor(rpiv-core): split index into per-concern registrars + SIBLINGS registry" (2026-04-15): created the declarative `SIBLINGS` pattern that this extraction leverages.
- `920c276` — "Consolidate skills catalog" (2026-04-11): 10 files changed, required README + guidance doc updates.
- `189a669` — "docs(guidance): sync architecture docs with post-refactor shape" (2026-04-15): guidance docs went stale after extraction — **always update all docs in the same commit**.

Composite lessons:
- **Agent sync is the #1 architectural decision** — the prior extraction didn't face this because tool plugins had no agents. Keeping the agent in rpiv-pi is the simplest solution.
- **Expect 5-10 follow-up commits** — the test-case extraction is simpler than the 4-plugin extraction (no session hooks, no config paths, no state), but README/guidance doc sync and npm packaging will need attention.
- **Update ALL documentation in the same commit** — README.md skill table + agent table, `.rpiv/guidance/skills/architecture.md`, `.rpiv/guidance/agents/architecture.md`. The prior extraction missed guidance docs (fixed 2 days later in `189a669`).
- **`peerDependencies` must NOT include the optional plugin** in rpiv-pi's `package.json` — causes npm warnings.
- **The `pendingRemove` manifest path** — when test-case skill dirs are removed from rpiv-pi, the next agent sync won't be affected (agents don't move). But verify the `.pi/agents/CLAUDE.md` update is correct.

## Historical Context (from thoughts/)

- `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md` — the prior 4-plugin extraction design (3380 lines); established the sibling package pattern
- `thoughts/shared/research/2026-04-15_23-28-56_artifact-organization-strategy.md` — explicitly noted test-case skills "will be extracted to a separate sibling plugin"
- `thoughts/shared/research/2026-04-13_16-11-41_extract-rpiv-core-tools-into-prerequisite-plugins.md` — prior extraction research; warned about cross-plugin hook ordering

## Developer Context

**Q (agent sync, `agents.ts:237-241` manifest replacement): Three approaches for handling agent sync when two packages share `.pi/agents/`. Which?**
A: Agent stays in rpiv-pi. Simplest — avoids manifest conflict entirely. Sibling is skills-only.

**Q (optional semantics, `siblings.ts:13-19` binary interface): Truly optional (no SIBLINGS) or soft-recommended (new optional field)?**
A: Truly optional. No SIBLINGS entry, no peerDependencies in rpiv-pi, no warning. User discovers via docs.

**Q (peer deps, `write-test-cases/SKILL.md:80-83` dispatching rpiv-pi agents): Should `@juicesharp/rpiv-pi` be a peer dependency of the sibling?**
A: Yes, include `@juicesharp/rpiv-pi` as a peer dependency of the sibling. Explicit declaration since skills dispatch rpiv-pi agents.

## Related Research

- Questions source: `thoughts/shared/questions/2026-04-16_09-37-15_extract-test-cases-sibling-plugin.md`
- `thoughts/shared/research/2026-04-15_23-28-56_artifact-organization-strategy.md` — artifact organization, noted test-cases extraction plan
- `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md` — prior 4-plugin extraction design

## Open Questions

- **Sibling repo creation**: Does the sibling live in `github.com/juicesharp/rpiv-test-cases` (separate repo) or as a monorepo subdirectory? The prior siblings are all separate repos.
- **`outline-test-cases/SKILL.md:5` inconsistency**: The `allowed-tools` list doesn't include `ask_user_question`, but the skill body uses it extensively. Should this be fixed before or after extraction?
- **`/rpiv-update-agents` after extraction**: When `test-case-locator.md` stays in rpiv-pi but the skills move out, `/rpiv-update-agents` would still manage it. This is correct but worth documenting in the sibling's README — users should run `/rpiv-update-agents` to keep the agent current.
- **Test-case-locator in `.pi/agents/CLAUDE.md`**: Should `test-case-locator.md` remain listed in the agent catalog CLAUDE.md even though its skills moved to a sibling? It's still functional (dispatched by the remaining skills) but conceptually belongs to the sibling.
