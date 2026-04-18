---
date: 2026-04-15T23:28:56-0400
researcher: Claude Code
git_commit: d271bdd
branch: main
repository: rpiv-pi
topic: "Artifact organization strategy: physical location, logical grouping, cross-referencing, and external tool integration"
tags: [research, codebase, artifacts, organization, thoughts, rpiv, pipeline, linear, jira, lifecycle, meta]
status: complete
questions_source: "thoughts/shared/questions/2026-04-15_22-51-49_artifact-organization-strategy.md"
last_updated: 2026-04-15
last_updated_by: Claude Code
---

# Research: Artifact Organization Strategy

## Research Question

How should pipeline artifacts be organized across three axes simultaneously: physical location (stay in `thoughts/`, move under `.rpiv/`, or somewhere else), logical grouping (type-first flat files vs. feature-first folders vs. hybrid index), and forward compatibility with external project-management tools (Linear, Jira, GitHub)? The answer needs to account for the current 7-producer skill pipeline, the `thoughts-locator`/`thoughts-analyzer` agents' search model, iterative re-runs on the same topic, and a recurring pattern of dead/stale artifact accumulation.

## Summary

The current layout has one structural organizing principle and two gaps.

The **organizing principle** is *pipeline artifacts consumed by skills* (`thoughts/shared/`) vs. *tool-specific infrastructure consumed by extensions* (`.rpiv/`). This split is coherent: `.rpiv/guidance/` is injected automatically by `extensions/rpiv-core/guidance.ts:53-97` on `tool_call` events; `.rpiv/test-cases/` is a closed-loop producer/consumer system; `thoughts/shared/` is read by explicit file-path arguments passed between skills. Moving pipeline artifacts into `.rpiv/` would blur this distinction and overload `.rpiv/` as a tool-infrastructure tree.

The **first gap** is grouping: type-first directories (`questions/`, `research/`, `designs/`, `plans/`) scatter a single feature's artifacts across four+ directories connected only by matching kebab-case slugs and backward `*_source` frontmatter pointers. Finding all artifacts for one feature requires cross-directory grep; finding all downstream consumers of a given artifact requires grepping every file in the tree. The test-case system at `.rpiv/test-cases/{feature-slug}/` demonstrates an alternative (feature-first + `_meta.md` contract + `_coverage-map.md` rollup) — but it works because only 2 producer skills coordinate that metadata; the pipeline has 7+ producers.

The **second gap** is lifecycle: the `status` frontmatter field exists on every artifact but no consumer reads it. `thoughts-locator.md:125` explicitly says "Don't read full file contents"; `resume-handoff/SKILL.md:16-18` reads linked artifacts without status checks; only `design/SKILL.md:210→333` transitions status in place (`in-progress` → `complete`). The Q4 audit (`2026-04-15_21-11-56_rpiv-pi-state-audit.md`) found 16 dead artifacts in 5 days out of 61 total, including 3 duplicate questions on the same topic.

Based on developer checkpoints, the strategy adopted is:

1. **Physical location**: configurable base path, meaningful default (stays in `thoughts/shared/`).
2. **Grouping**: feature-first folders `{base}/features/{feature-slug}/` replace the type-first flat split. Topic slug lives in the folder name, not in filenames.
3. **Iterations**: timestamped files inside each feature folder; the `_meta.md` tracks which one is current per type.
4. **Naming**: `{type}_YYYY-MM-DD_HH-MM-SS.md` — `ls` groups by type alphabetically; chronology within type is preserved; `_meta.md` sorts first due to leading underscore.
5. **Cross-referencing**: `_meta.md` is the per-feature index + pipeline state record. The existing backward `*_source` frontmatter fields stay; `_meta.md` provides the forward-pointer view.
6. **Lifecycle**: `_meta.md` carries authoritative feature status (`active | archived | abandoned`). A new audit/cleanup skill reconciles drift and rebuilds indexes. `thoughts-locator` starts respecting `_meta.md` status.
7. **External integration**: one optional `external_id` field per artifact for fine-grained sync; `_meta.md` carries a feature-level `external_id` for the epic.

Test-case skills (`outline-test-cases`, `write-test-cases`) are out of scope — they will be extracted to a separate sibling plugin with its own organization and do not participate in this restructure.

## Detailed Findings

### The Implicit Organizing Principle (Q1)

The split between `thoughts/shared/` and `.rpiv/` is not "ephemeral vs permanent." It is "consumed by skills via explicit paths vs consumed by extensions via automatic injection."

- **`thoughts/` producers**: 7 skills write timestamped artifacts (`discover/SKILL.md:172`, `research/SKILL.md:184`, `explore/SKILL.md:65`, `design/SKILL.md:209`, `plan/SKILL.md:72-73`, `create-handoff/SKILL.md:17`, `code-review/SKILL.md:81`).
- **`thoughts/` consumers**: Downstream skills receive artifact paths as `argument-hint` and pass them through chaining commands (`research/SKILL.md:277-279` emits `/skill:design thoughts/shared/research/[filename].md`).
- **`.rpiv/guidance/` consumers**: `extensions/rpiv-core/guidance.ts:53-97` injects architecture docs on `tool_call` automatically, no skill invocation required.
- **`.rpiv/test-cases/` consumers**: Closed loop between `outline-test-cases` and `write-test-cases`; `_meta.md` is the inter-skill contract at `outline-test-cases/SKILL.md:338`.

### Git Treatment Is Project-Specific (Q1)

The committed-vs-ephemeral decision is not framework-enforced:

- `rpiv-pi/.gitignore:6` contains `thoughts/` → all 57 current `thoughts/shared/` files are gitignored.
- `rpiv-pi/.gitignore:3` contains `.rpiv/` → both trees gitignored in the framework repo.
- `rpiv-skillbased/.gitignore` contains neither → thoughts/ is committed there.

This is load-bearing: rpiv-pi is the framework (development artifacts don't belong in tarball); rpiv-skillbased is a consumer project (decision history is value). Any configurable-base-path design must let projects decide whether the base path is committed.

### THOUGHTS_DIRS Scaffolding Is Incomplete (Q1, Q8)

`session-hooks.ts:22-28`:
```
"thoughts/shared/research",
"thoughts/shared/questions",
"thoughts/shared/designs",
"thoughts/shared/plans",
"thoughts/shared/handoffs",
```

Skills actually write to 9+ directories: these 5 plus `solutions/` (`explore/SKILL.md:65`), `reviews/` (`code-review/SKILL.md:81`), `tickets/`, and `prs/` (`agents/thoughts-locator.md:38-53`). The unscaffolded directories are lazily created by `Write` tool's `recursive: true`. Scaffolding is a one-shot no-op after the first session (`mkdirSync { recursive: true }` at `session-hooks.ts:87-91`) — it creates nothing per-session, so the "session infrastructure" framing is misleading.

### Phantom me/ and global/ Directories (Q8)

`agents/thoughts-locator.md:14-15` tells the agent to check `thoughts/me/` and `thoughts/global/`. `agents/thoughts-locator.md:38-53` documents the full tree including `me/tickets/`, `me/notes/`, `global/`. `skills/plan/SKILL.md:171` references `thoughts/me/tickets/[file].md` in its template. **None of these directories are scaffolded by `session-hooks.ts`. No producer skill writes to them.** They are documented conceptual namespaces with no code path. Any reorganization should either activate them (with producer skills) or remove the references.

### Type-First vs Feature-First — The Iteration Constraint (Q2, Q7)

The rpiv-skillbased tree demonstrates the iteration problem: topic `outline-test-cases` has 9 artifacts across 3 separate research→design→plan cycles (2026-03-31 through 2026-04-01):
- `research/2026-03-31_19-34-15_test-case-skills-architecture.md`
- `designs/2026-04-01_08-43-43_outline-test-cases-skill.md`
- `plans/2026-04-01_08-53-34_outline-test-cases-skill.md`
- …through 2026-04-01_15-03-53 (third iteration)

Pure feature-first `features/outline-test-cases/{questions,research,design,plan}.md` cannot hold 3 research files. Keeping timestamps inside the feature folder reintroduces the unique-filename mechanism while preserving feature co-location. This is the adopted approach.

### Cross-Referencing Is Backward-Only (Q3)

Three layers exist:
- **Layer A (prose chain)**: `discover/SKILL.md:218-221`, `research/SKILL.md:277-279`, `design/SKILL.md:358`, `plan/SKILL.md:188` — ephemeral, session-local, not in artifacts.
- **Layer B (backward frontmatter)**: `questions_source`, `research_source`, `design_source` set by `research/SKILL.md:206`, `design/SKILL.md:218`, `plan/SKILL.md:98`.
- **Layer C (inline References sections)**: free-text, not machine-parsed, duplicated with Layer B.

There is no forward pointer. Finding all downstream artifacts of a given questions doc requires grepping every file in `thoughts/shared/`. `thoughts-locator.md:118-121` follows backward links but cannot efficiently enumerate forward consumers. `_meta.md` closes this gap by acting as the directory-level forward index.

### Status Field Is Declared but Never Consumed (Q4)

Status values set by producers:
| Skill | Initial | Transitions |
|-------|---------|-------------|
| discover | `complete` | never |
| research | `complete` | never |
| explore | `ready / awaiting_input / blocked` | never |
| design | `in-progress` | → `complete` (`design/SKILL.md:333`) |
| plan | `ready` | never |
| code-review | `approved / needs_changes / requesting_changes` | never |
| create-handoff | `complete` | never |

`thoughts-locator.md:116` lists `status:` as a searchable frontmatter field but does not filter by it. `resume-handoff/SKILL.md:16-19` reads linked artifacts without checking status. The 16-dead-in-5-days accumulation from `2026-04-15_21-11-56_rpiv-pi-state-audit.md` is a direct consequence.

### `_meta.md` as Pipeline Contract (Q7, adapted)

The test-case system's `_meta.md` template at `skills/outline-test-cases/templates/feature-meta.md:3-10` establishes the pattern:
```
---
feature: ...
slug: ...
status: pending | partial | generated
generated: ...
git_commit: ...
---
```

Adapted for pipeline artifacts, `_meta.md` per feature holds:
- Feature-level frontmatter: `slug`, `external_id`, `status: active | archived | abandoned`, `created`, `last_updated`
- Pipeline progress checklist (which types exist, which is current per type)
- Checkpoint history (developer answers from skill checkpoints)
- Scope decisions

Critical difference: the test-case system has 2 producers (`outline-test-cases` creates, `write-test-cases` updates). The pipeline has 7+ producers. Each must learn to append a single line to `_meta.md`. This is simpler than maintaining a JSON manifest (escaping, concurrent writes) and simpler than a rebuild-from-scratch pattern (no globbing step added to every skill).

### File Naming Inside Feature Folders (Q2, developer decision)

Adopted pattern: `{type}_YYYY-MM-DD_HH-MM-SS.md`
- `questions_2026-04-10_08-45-32.md`
- `research_2026-04-10_13-45-00.md`
- `research_2026-04-12_09-00-00.md` (second iteration)
- `design_2026-04-10_11-18-29.md`
- `plan_2026-04-10_14-00-00.md`
- `_meta.md` (sorts first due to leading underscore)

`ls` groups by type alphabetically; within a type, iterations sort chronologically. Topic slug is dropped from filename (it's the folder name). Frontmatter `topic:` field keeps the human-readable title.

### External Integration Readiness (Q5)

Minimal extension is a single optional `external_id: "LINEAR-123"` field per artifact, plus a feature-level `external_id` in `_meta.md`. The value format itself disambiguates systems (Linear `XXX-NNN`, Jira `KEY-NNN`, GitHub `#NNN`); a future integration skill knows which system it's syncing with.

The feature folder itself is the epic boundary (folder slug = feature_id). No separate `feature_id` or `epic` field needed — the path structure encodes it.

No other frontmatter additions needed for initial integration: existing `status`, `tags`, `branch`, `date`, and role-specific authorship fields (`researcher`/`designer`/`planner`/`reviewer`) cover the remaining mapping. The integration skill resolves the role-polymorphism at sync time.

### Sub-Artifact Referencing (Q6) — Deferred

Research found three mechanisms: heading anchors (fragile under revise), directory splitting (high skill-rewrite cost), and in-file `## Sub-Artifact Index` (lowest disruption). The developer deferred this as an enhancement not on the critical path. It can be added later without schema changes because stable IDs (`SA-NNN`) are local to each artifact.

## Code References

- `extensions/rpiv-core/session-hooks.ts:22-28` — `THOUGHTS_DIRS` constant (5 dirs scaffolded of 9+ written to)
- `extensions/rpiv-core/session-hooks.ts:87-91` — `scaffoldThoughtsDirs` (no-op after first session)
- `extensions/rpiv-core/guidance.ts:53-97` — `.rpiv/guidance/` injection on `tool_call` (not `thoughts/`)
- `agents/thoughts-locator.md:38-53` — documented directory tree including phantom `me/` and `global/`
- `agents/thoughts-locator.md:116-121` — frontmatter fields it greps; follows backward `*_source` chains
- `agents/thoughts-locator.md:125` — "Don't read full file contents" (explains why status is ignored)
- `agents/thoughts-analyzer.md:63-68` — extracts `Upstream` from `*_source` fields
- `skills/discover/SKILL.md:172, 218-221` — writes `questions/`, chains to research
- `skills/research/SKILL.md:184, 204-206, 277-279` — writes `research/`, sets `questions_source`, chains to design
- `skills/design/SKILL.md:209-210, 218, 333, 358` — writes `designs/`, ONLY skill with real status transition (`in-progress` → `complete`)
- `skills/plan/SKILL.md:72-73, 97-98, 188` — writes `plans/`, sets `design_source`, chains to implement
- `skills/explore/SKILL.md:65, 76-88` — writes `solutions/` (unscaffolded), carries unique `confidence`/`complexity` fields
- `skills/code-review/SKILL.md:81, 96-108` — writes `reviews/` (unscaffolded)
- `skills/create-handoff/SKILL.md:17, 57-67` — writes `handoffs/`, lists artifacts exhaustively without in-use marking
- `skills/resume-handoff/SKILL.md:16-19` — hardcodes `thoughts/shared/plans`, `research`, `solutions` paths
- `skills/outline-test-cases/SKILL.md:236-246, 338` — `_meta.md` creation and inter-skill contract declaration
- `skills/outline-test-cases/templates/feature-meta.md:3-10` — `_meta.md` frontmatter schema (template for adaptation)
- `skills/write-test-cases/SKILL.md:252-264` — `_coverage-map.md` rebuild-from-scratch pattern
- `skills/revise/SKILL.md:111-129` — in-place plan edits with no history (`last_updated` only)
- `skills/implement/SKILL.md:12-14, 54-55` — consumes plans, edits checkboxes in-place
- `rpiv-pi/.gitignore:3, 6` — both `.rpiv/` and `thoughts/` gitignored here
- `rpiv-skillbased/.gitignore` — neither gitignored (committed)

## Integration Points

### Inbound References
- `extensions/rpiv-core/session-hooks.ts:22-28` — current scaffolding of 5 type dirs must change to feature-folder base path
- `extensions/rpiv-core/session-hooks.ts:87-91` — scaffolding helper becomes configurable base-path resolver
- `agents/thoughts-locator.md:38-53` — directory tree documentation rewrites for feature-first layout
- `agents/thoughts-locator.md:65-98` — output format categorization switches from type-grouped to feature-grouped (or dual)
- `agents/thoughts-locator.md:116-121` — status-aware filtering added; `_meta.md` becomes a primary search target
- `agents/thoughts-analyzer.md:63-68` — `Upstream:` extraction unchanged; works with feature-folder paths
- `skills/{discover,research,explore,design,plan,create-handoff,code-review}/SKILL.md` — filename pattern updates (`{type}_YYYY-MM-DD_HH-MM-SS.md` inside feature folder); `_meta.md` append step
- `skills/resume-handoff/SKILL.md:18` — hardcoded type-directory paths switch to feature folder + `_meta.md` traversal
- `skills/implement/SKILL.md`, `skills/revise/SKILL.md`, `skills/validate/SKILL.md` — consume plans by path; minor updates for new path layout

### Outbound Dependencies
- `rpiv-skillbased/GUIDE.md` and `README.md` — document the new layout
- Developer `.gitignore` patterns per project — configurable base path interacts with user gitignore preferences

### Infrastructure Wiring
- `extensions/rpiv-core/session-hooks.ts` — base-path resolution from config (new); scaffolding emits `{base}/features/` parent only, feature folders created on-demand by `discover`
- `extensions/rpiv-core/constants.ts` — default base path constant
- Configuration surface TBD: `package.json` `rpiv` field, `.rpiv/config.json`, or `.rpivrc` — not yet chosen

## Architecture Insights

1. **The implicit organizing principle is "consumer-mechanism"**: skills-by-path vs extensions-by-injection. Preserve it. Keep pipeline artifacts in `thoughts/shared/` (or configured base); keep tool infrastructure in `.rpiv/`.

2. **Type-first flat layout has one strength the feature-first layout must preserve**: producer skills know exactly where to write (one directory per skill type). Feature-first shifts the burden: the producer must determine or receive the feature slug. The `discover` skill (pipeline root) is the natural slug creator; downstream skills inherit via the chaining argument path.

3. **Iteration is the load-bearing constraint.** Any feature-first design that collapses to a single file per type fails on real-world usage. Timestamped filenames within the feature folder preserve uniqueness without reintroducing type-directory scatter.

4. **`_meta.md` is a directory-level manifest, not a cross-project index**. The test-case `_coverage-map.md` pattern (project-wide rebuild) does not transfer — the pipeline's 7+ producers make that expensive. Per-feature `_meta.md` with per-skill append is the maintenance sweet spot.

5. **Status field needs one consumer to become real**: `thoughts-locator` filtering by `_meta.md` status is the cheapest enforcement point. Producer skills keep setting `status:` on individual artifacts (no change); the consumer shift does the work.

6. **Phantom references are the #1 recurring pattern across precedents** (see Precedents & Lessons below). Any reorganization must sweep `me/`, `global/`, and `searchable/`-style stale paths in the same pass. Count on a second cleanup commit.

7. **External integration is a naming-convention problem, not an architecture problem**. A single optional `external_id` field + the feature-folder slug as epic boundary covers 80% of Linear/Jira sync needs. The remaining 20% (priority, assignee normalization) is the integration skill's responsibility, not the pipeline's.

## Precedents & Lessons

8 similar past changes analyzed. Key commits:

- `d6de433` — "Cache git context across agent turns; drop stale thoughts/ artifacts" (2026-04-14): mass deletion of 55 thoughts/ files; `fab149d` added `thoughts/` gitignore 2 minutes later retroactively.
- `7b164dc` (rpiv-skillbased) — "cleanup: remove thoughts/searchable/ phantom references from 6 skills and 1 agent" (2026-04-07): 7 files referencing a path that never existed; `e867868` same-day bundled a second cleanup pass.
- `a69e687`, `317f24e`, `74b1cbb` — CLAUDE.md → `.rpiv/guidance/` migration (2026-04-13): 17 files touched; `31e9cc4` same-day and `189a669` 2 days later swept ~20 stale references that survived the migration.
- `6ebc89c` (rpiv-skillbased) — YAML frontmatter added to plan artifacts (2026-04-06): propagated piecemeal across skills; `4916a8f` 8 days later was still fixing hardcoded `"Claude Code"` in 7 SKILL.md templates.
- `920c276`, `f2c5ab1`, `1b4c33d` — 3 skill rename/consolidation waves in 4 days: 33-file blast radius per wave.
- `b562056`, `0fdfe95`, `6927aa6` — manifest-based agent sync (2026-04-14): detect-only mode leaked pending-remove state within 1.5 hours; documentation commit same day.
- `20539e8` (rpiv-skillbased), `a6c7cf6`, `48f7aa3`, `28af7f1`, `d82bb41` — test-case pattern took 4 iteration passes before stabilizing.
- `32eaf33`, `d271bdd` — `session-hooks.ts` refactor and constants extraction (2026-04-15): `THOUGHTS_DIRS` has been stable since initial commit but the 5-of-9 mismatch has never been fixed.

Composite lessons:

- **Phantom references are the #1 recurring pattern** (4 incidents: `searchable/`, guidance migration stale refs, `me/`+`global/`, hardcoded `"Claude Code"`). Any path or schema change creates them in proportion to how many files embed that convention. Budget a sweep commit.
- **Two-phase cleanup is the observed norm, not one-shot.** Every organizational change in the history required follow-up fixes within hours to days.
- **Frontmatter schema changes propagate slowly.** The `*_source` backward-link fields shipped without forward pointers, which is what motivated this research 8 days later. Any new field must ship with updates to all 7 producer templates AND the consumer agents' search patterns simultaneously.
- **Committed-vs-ephemeral must be decided proactively**, not after mass accumulation. rpiv-pi's gitignore landed retroactively after 55 files accumulated. The configurable base path must include a documented convention for when to commit.
- **Manifest/index systems need read-vs-write discipline from day one** (`0fdfe95` precedent). The audit/cleanup skill's scan mode must be explicitly distinct from its write mode.

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-04-15_21-11-56_rpiv-pi-state-audit.md` — the 16-dead-in-5-days audit; source for the accumulation problem this research addresses.
- `thoughts/shared/research/2026-04-12_02-27-43_skill-flow-chaining.md` — establishes "only files on disk survive a session reset" as the inter-skill contract.
- `thoughts/shared/research/2026-04-13_08-24-28_pi-claude-md-subfolder-resolution.md` — designed the `AGENTS.md > CLAUDE.md > .rpiv/guidance/<sub>/architecture.md` priority ladder.
- `thoughts/shared/research/2026-04-14_naming-conventions-unification.md` — prior schema normalization work.
- `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md` — 3367-line monolithic design; illustrates Q6 sub-artifact pressure.

## Developer Context

**Q (physical location, `session-hooks.ts:22-28`): Given 18-file blast radius and the precedent pattern of 2-phase cleanups, should we change the physical location at all?**
A: Make the base path configurable with a meaningful default. Target projects may not want `thoughts/` at the repo root; some may prefer `.rpiv/artifacts/`. Framework provides default; user overrides per project.

**Q (iterations, `rpiv-skillbased/thoughts/shared/` with 9 artifacts for `outline-test-cases` across 3 cycles): how do feature folders hold multiple research files?**
A: Timestamped inside feature folder. `_meta.md` tracks which is current.

**Q (scope, test-case pattern at `skills/outline-test-cases/templates/feature-meta.md`): adapt the test-case `_meta.md` pattern for pipeline artifacts?**
A: Extract test-case skills (`outline-test-cases`, `write-test-cases`) into a separate sibling plugin with its own organization. They should not share organization with pipeline thoughts/ artifacts. The `_meta.md` contract can still be adapted from the same template, but the test-case skills themselves move out.

**Q (`_meta.md` contract, noting the 2-vs-7 producer difference): index-plus-pipeline-state, rebuild-from-scratch, or minimal header?**
A: Index + pipeline state. Track all artifacts in the feature (including timestamped iterations), mark current per type, record pipeline stage, carry feature-level frontmatter.

**Q (lifecycle, `thoughts-locator.md:125` ignoring status): how to reconcile status drift if `_meta.md` is authoritative?**
A: Combine the mechanisms. `_meta.md` holds authoritative status. A dedicated audit/cleanup skill reconciles drift, proposes updates, rebuilds indexes. `thoughts-locator` respects `_meta.md` status.

**Q (external IDs, no existing Linear/Jira references found): minimum frontmatter extension?**
A: Single optional `external_id` per artifact; `_meta.md` carries feature-level `external_id` for the epic.

**Q (file naming inside feature folder, 7 producer SKILL.md templates hard-code the current pattern): naming strategy?**
A: `{type}_YYYY-MM-DD_HH-MM-SS.md`. Groups by type alphabetically in `ls`; iterations sort chronologically within type. `_meta.md` sorts first due to leading underscore.

## Related Research

- Questions source: `thoughts/shared/questions/2026-04-15_22-51-49_artifact-organization-strategy.md`
- `thoughts/shared/research/2026-04-15_21-11-56_rpiv-pi-state-audit.md` — the audit that surfaced the accumulation problem
- `thoughts/shared/research/2026-04-12_02-27-43_skill-flow-chaining.md` — inter-skill contract via disk artifacts
- `thoughts/shared/research/2026-04-13_08-24-28_pi-claude-md-subfolder-resolution.md` — `.rpiv/guidance/` injection model
- `thoughts/shared/research/2026-04-14_naming-conventions-unification.md` — prior schema normalization

## Open Questions

- **Configuration surface for the base path**: `package.json` `rpiv` field, `.rpiv/config.json`, or `.rpivrc`? Each interacts differently with `session-hooks.ts`'s startup-time scaffolding and with gitignore patterns.
- **Migration path for existing `thoughts/shared/{type}/*.md` files**: one-shot migration script, lazy migration by audit skill, or coexistence mode where both layouts are valid?
- **Feature-slug derivation**: `discover` skill creates the slug from the topic string. What happens if two different features yield the same slug (`complete-pi-migration` from two different contexts)? Collision resolution needed.
- **Sub-artifact referencing (Q6)**: deferred as enhancement. Add later via in-file `## Sub-Artifact Index` with stable `SA-NNN` IDs if discoverability becomes a pain point.
- **Activation or removal of `thoughts/me/` and `thoughts/global/`**: phantom references in `agents/thoughts-locator.md` and `skills/plan/SKILL.md` should either be backed by producer skills or removed in the same sweep as the reorganization.
- **`status` field consumption precedent**: `thoughts-locator` becoming status-aware is a behavior change for a grep-only agent. How does a `tools: grep, find, ls` agent handle `_meta.md` parsing without `read`?
