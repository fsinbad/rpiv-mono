---
date: 2026-04-14T10:44:27-0400
researcher: Sergii
git_commit: 5f3e5f8
branch: master
repository: rpiv-pi
topic: "Study naming conventions for skills, agents, and commands to unify and rename flow semantics"
tags: [research, codebase, naming-conventions, skills, agents, commands, pipeline]
status: complete
questions_source: "thoughts/shared/questions/2026-04-14_10-19-28_naming-conventions-unification-flow.md"
last_updated: 2026-04-14
last_updated_by: Sergii
---

# Research: Study naming conventions for skills, agents, and commands to unify and rename flow semantics

## Research Question
How should rpiv-pi unify naming across skills, agents, slash commands, and pipeline flow semantics while preserving operational compatibility and minimizing drift across runtime code, guidance, and README surfaces?

## Summary
The codebase has split-but-clear executable authority: core slash command names are runtime literals in `extensions/rpiv-core/index.ts`, while skill and agent names are declarative identities in SKILL/agent frontmatter (with filename coupling for agents). Drift happens in descriptive mirrors (`README.md`, guidance tables, inline chain text), not in runtime registration surfaces. The current pipeline vocabulary mixes verb-stage names, noun artifact folders, and overloaded "Phase" terminology, which increases cognitive load during manual chaining. Historical precedents show naming migrations succeed only when all identity-bearing surfaces change together and are immediately validated; otherwise quick follow-up fixes are required. Developer decisions for this topic are: define process-reflective names first, adopt verb-first stage naming, preserve command ownership boundaries (`/rpiv-*` core vs bare sibling commands), and proceed with hard cutover (no agent alias period).

## Detailed Findings

### 1) Skill naming contract and rename blast radius
- Pi discovers only skill directories via manifest (`package.json:10`), so actual invocation identity comes from SKILL frontmatter `name` (`.rpiv/guidance/skills/architecture.md:28-30`, `skills/research/SKILL.md:2`).
- Folder/name mapping is an explicit contract (`.rpiv/guidance/skills/architecture.md:73`), making a rename a multi-surface identity change, not a docs-only update.
- Chained emitters hard-code downstream skill names and artifact paths (`skills/research-questions/SKILL.md:210-220`, `skills/research/SKILL.md:267-278`).
- `description` and `argument-hint` fields shape user understanding of phase semantics and required upstream artifact (`skills/research/SKILL.md:3-4`, `skills/design/SKILL.md:3-4`, `.rpiv/guidance/skills/architecture.md:29-30`).

### 2) Command ownership and prefix policy in runtime
- rpiv-core registers only `/rpiv-update-agents` and `/rpiv-setup` (`extensions/rpiv-core/index.ts:123-141`), defining core-owned command namespace.
- Bare commands (`/todos`, `/advisor`, `/web-search-config`) appear as sibling-provided capabilities in setup messaging (`extensions/rpiv-core/index.ts:161-177`).
- Missing capability detection is regex-based over installed package entries in `~/.pi/agent/settings.json` (`extensions/rpiv-core/package-checks.ts:15-50`).
- README and top-level guidance both list mixed command sets, but runtime remains authoritative for core registrations (`README.md:107-111`, `.rpiv/guidance/architecture.md:25-30`, `extensions/rpiv-core/index.ts:123-141`).

### 3) Agent identity invariants and rename safety profile
- Agent identity is contractually 3-way coupled: filename stem = frontmatter `name` = `subagent_type` literal (`.rpiv/guidance/agents/architecture.md:31,69`).
- Copy pipeline is filename-driven and non-validating (`extensions/rpiv-core/agents.ts:49-59`) and is invoked at session start plus `/rpiv-update-agents` (`extensions/rpiv-core/index.ts:61,123-136`).
- Default copy skips existing local files (`extensions/rpiv-core/agents.ts:53-55`), allowing local `.pi/agents` drift from bundled definitions.
- Contract docs warn unresolved identities can silently degrade behavior via fallback (`.rpiv/guidance/agents/architecture.md:9`), so partial renames are high-risk.

### 4) Pipeline semantics (action vs artifact vs sequence)
- Runtime scaffolds noun artifact directories at session start: `questions`, `research`, `designs`, `plans`, `handoffs` (`extensions/rpiv-core/index.ts:43-51`).
- Skill names are mostly action-oriented (`research-questions`, `write-plan`, `implement-plan`) while outputs are noun/plural paths (`skills/research-questions/SKILL.md:2-3`, `skills/write-plan/SKILL.md:2-3`).
- "Phase" is overloaded between research stage sequencing and implementation execution phases (`skills/research-questions/SKILL.md:3`, `skills/research/SKILL.md:3`, `skills/write-plan/SKILL.md:188`).
- Documentation surfaces use slightly different flow language and inventory emphasis (`README.md:48-52,134`, `.rpiv/guidance/architecture.md:19`).

### 5) Single-source authority model and drift points
- Executable truth for core commands is TypeScript registration (`extensions/rpiv-core/index.ts:123-141`).
- Declarative truth for skills/agents is frontmatter identity (and filename for agents) (`skills/*/SKILL.md:2`, `agents/*.md:2`, `.rpiv/guidance/skills/architecture.md:28-30`, `.rpiv/guidance/agents/architecture.md:31,69`).
- Drift hotspots are mirrors: README command/flow tables, guidance summaries, and inline chain prose in SKILL docs (`README.md:48-52,107-111`, `.rpiv/guidance/architecture.md:19,25-30`, `skills/research/SKILL.md:27-30`).
- The effective governance pattern should be authority-by-surface (runtime/frontmatter) with generated or validated mirrors.

### 6) Migration/compatibility precedents and constraints
- Prior migrations touched many surfaces and required follow-up fixes when naming/contracts lagged (`66eaea3`, `920c276`, `08b230e`, `30544d7`, `8938714`, `4916a8f`).
- Plugin extraction wave preserved visible names deliberately, reducing user breakage while changing ownership internals (`c388ea9`, `extensions/rpiv-core/index.ts:12-14`).
- Guidance namespace migration required additional cleanup to remove stale references (`a69e687` followed by `31e9cc4`).
- README/package rename and pipeline wording changed again immediately after for correctness (`a02f709` followed by `5f3e5f8`).

## Code References
- `package.json:10-21` — Skill discovery root and peer dependency naming contract.
- `extensions/rpiv-core/index.ts:38-80` — Session-start bootstrapping, missing-sibling warning.
- `extensions/rpiv-core/index.ts:123-141` — Core slash command registration (`rpiv-update-agents`, `rpiv-setup`).
- `extensions/rpiv-core/index.ts:148-239` — `/rpiv-setup` capability mapping + install choreography.
- `extensions/rpiv-core/package-checks.ts:15-50` — Installed-package reader and regex detection rules.
- `extensions/rpiv-core/agents.ts:19-25` — Package root + bundled agents path resolution.
- `extensions/rpiv-core/agents.ts:36-62` — Copy semantics (overwrite/skip behavior, no validation/prune).
- `.rpiv/guidance/architecture.md:19-30` — Top-level pipeline and command map.
- `.rpiv/guidance/skills/architecture.md:28-30` — SKILL frontmatter identity/schema contract.
- `.rpiv/guidance/skills/architecture.md:73-82` — Add-skill invariants and chain positioning guidance.
- `.rpiv/guidance/agents/architecture.md:31-35` — Agent definition identity format.
- `.rpiv/guidance/agents/architecture.md:69` — filename stem == `name` invariant.
- `skills/research-questions/SKILL.md:2-4` — Phase 1 naming and contract.
- `skills/research-questions/SKILL.md:210-220` — Chain output to `/skill:research`.
- `skills/research/SKILL.md:2-4` — Phase 2 naming and argument semantics.
- `skills/research/SKILL.md:27-30` — Upstream dependency text hard-coded to research-questions.
- `skills/research/SKILL.md:267-278` — Chain output to `/skill:design`.
- `skills/design/SKILL.md:2-4` — Design skill identity and upstream artifact requirement.
- `skills/write-plan/SKILL.md:2-4` — Plan-writing identity and output semantics.
- `skills/write-plan/SKILL.md:188` — `implement-plan` phase handoff phrasing.
- `README.md:48-52` — Typical workflow command chain.
- `README.md:107-111` — Mixed command inventory and ownership presentation.

## Integration Points
Command, skill, and agent naming touch three integration planes: runtime registration, declarative identity files, and user-facing mirrors.

### Inbound References
- `.rpiv/guidance/architecture.md:26` — `/skill:<name>` invocation contract consumed by users.
- `README.md:59` — User instruction for invoking skills by name.
- `skills/research/SKILL.md:27-30` — Runtime operator instructions consuming prior skill naming.
- `skills/design/SKILL.md:3` — Design stage consumes named upstream skill output.

### Outbound Dependencies
- `extensions/rpiv-core/package-checks.ts:21-30` — Depends on `~/.pi/agent/settings.json` for package presence truth.
- `extensions/rpiv-core/index.ts:151-177` — Depends on sibling package identities and capability mapping.
- `package.json:17-21` — Declares sibling package dependency contract used by setup/checkers.

### Infrastructure Wiring
- `extensions/rpiv-core/index.ts:38-62` — `session_start` wires guidance/git context, artifact scaffolding, and agent copying.
- `extensions/rpiv-core/index.ts:123-137` — `/rpiv-update-agents` wiring to overwrite copy mode.
- `extensions/rpiv-core/index.ts:140-241` — `/rpiv-setup` wiring to detect/install dependencies.
- `extensions/rpiv-core/agents.ts:49-59` — Filesystem copy wiring from bundled `agents/` to workspace `.pi/agents/`.

## Architecture Insights
- Naming authority is best treated as **surface-local executable truth** (runtime registrations and identity frontmatter), not a single prose document.
- The most fragile naming surfaces are chain emitters and prerequisite prompts inside SKILL bodies; they behave like integration contracts, not comments.
- Artifact directory naming and stage naming are orthogonal concerns and should be explicitly separated in terminology (verb stage vs noun artifact).
- Non-validating copy and non-pruning behavior in agent sync increase migration complexity and can mask rename issues in drifted workspaces.

## Precedents & Lessons
4 major similar migration waves were identified. Key commits: `66eaea3`, `920c276`, `8610ae5`, `c388ea9`, `a69e687`, `a02f709`, with follow-ups `08b230e`, `30544d7`, `8938714`, `4916a8f`, `31e9cc4`, `5f3e5f8`.

- Multi-surface renames need atomic updates across runtime literals, frontmatter identities, chain emitters, and docs; otherwise fast follow-up fixes are almost guaranteed (`66eaea3` → `08b230e`/`30544d7`/`8938714`).
- Ownership-boundary refactors are safer when user-facing command names remain stable during internal extraction (`c388ea9`), with migration messaging concentrated in setup/session warnings (`extensions/rpiv-core/index.ts:69-80,148-239`).
- Guidance/document namespace migrations require immediate cross-reference sweeps to remove stale semantics (`a69e687` → `31e9cc4`).
- Pipeline vocabulary in README/guidance can drift even after broad rewrites and needs explicit validation against the executable chain (`a02f709` → `5f3e5f8`).

## Historical Context (from thoughts/)
- `thoughts/shared/designs/2026-04-10_11-18-29_complete-pi-migration.md` — Pi-native migration design decisions and naming contracts.
- `thoughts/shared/plans/2026-04-10_12-46-17_complete-pi-migration.md` — execution plan/checklist for the migration.
- `thoughts/shared/research/2026-04-13_16-11-41_extract-rpiv-core-tools-into-prerequisite-plugins.md` — extraction compatibility findings and risk notes.
- `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md` — plugin extraction architecture and compatibility strategy.
- `thoughts/shared/plans/2026-04-13_17-52-15_extract-rpiv-plugins.md` — phased rollout plan for plugin extraction.
- `thoughts/shared/designs/2026-04-14_08-56-08_professional-readme-rewrite.md` — README flow/command presentation strategy.
- `thoughts/shared/questions/2026-04-14_10-19-28_naming-conventions-unification-flow.md` — upstream questions artifact for this research.

## Developer Context
**Q (`extensions/rpiv-core/index.ts:123-141`, `skills/*/SKILL.md:2`): Should naming authority be runtime/frontmatter or docs-first?**
A: "we first should commup with proper naming that reflect the process (pipeline) then use that consistent across all affected areas to keep them in sync"

**Q (`extensions/rpiv-core/index.ts:43-51`, `skills/research/SKILL.md:3`, `skills/write-plan/SKILL.md:188`): Which pipeline naming style should drive unification?**
A: Verb-first stage names.

**Q (`extensions/rpiv-core/index.ts:123-141`, `extensions/rpiv-core/index.ts:164-177`): Keep ownership boundary in command prefixes?**
A: Keep ownership boundary.

**Q (`.rpiv/guidance/agents/architecture.md:31,69`, `extensions/rpiv-core/agents.ts:53-55`): Should agent renames require an alias period?**
A: No (hard cutover).

## Related Research
- Questions source: `thoughts/shared/questions/2026-04-14_10-19-28_naming-conventions-unification-flow.md`
- Related: `thoughts/shared/research/2026-04-13_16-11-41_extract-rpiv-core-tools-into-prerequisite-plugins.md`

## Open Questions
- What exact verb-first canonical stage lexicon should replace current mixed terms (concrete names and ordering), including whether `research-questions` is renamed and how `write-plan` vs `plan` is represented.
- If agent renames are hard cutover (no alias period), what explicit verification gate will detect unresolved `subagent_type` literals before release given documented fallback risk (`.rpiv/guidance/agents/architecture.md:9`).
