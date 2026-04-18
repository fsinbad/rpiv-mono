---
date: 2026-04-15T23:52:12-0400
designer: Claude Code
git_commit: d271bdd
branch: main
repository: rpiv-pi
topic: "Artifact organization: feature-first folders + _meta.md contract + configurable base path"
tags: [design, artifacts, organization, thoughts, rpiv, pipeline, feature-folders, meta-md, config]
status: complete
research_source: "thoughts/shared/research/2026-04-15_23-28-56_artifact-organization-strategy.md"
last_updated: 2026-04-16
last_updated_by: Claude Code
last_updated_note: "Assessment feedback applied: (1) contract-source hybrid — mechanical steps canonical in _meta.md template, producer SKILL.md blocks name only skill-specific values; (2) explore stays project-level at {base}/solutions/ (dropped mode branching and _meta.md seeding); (4) discover collision rule made explicit via _meta.md `^feature:` grep."
---

# Design: Artifact Organization — Feature-First Layout + `_meta.md` Contract

## Summary

Replace type-first `thoughts/shared/{type}/` with feature-first folders at `{base}/features/{slug}/`; each folder carries timestamped artifacts (`{type}_YYYY-MM-DD_HH-MM-SS.md`) and a shared `_meta.md` whose Producer Contract — canonical in the template only — defines how every producer updates it. Base path is configurable via `.rpiv/config.json` `artifactsBase` (default `thoughts/shared`), read by a new `extensions/rpiv-core/artifacts-config.ts` utility (modeled on `package-checks.ts:11-23`). Pipeline producers (`discover`, `research`, `design`, `plan`) write into feature folders; `explore`, `create-handoff`, and `code-review` stay project-level at `{base}/solutions/`, `{base}/handoffs/`, `{base}/reviews/`.

## Requirements

- Keep pipeline artifacts in a configurable base path with `thoughts/shared` default (research decision 1)
- Replace type-first layout with feature-first folders (research decision 2)
- Support iteration via timestamped filenames inside feature folders (research decision 3)
- Name artifacts `{type}_YYYY-MM-DD_HH-MM-SS.md` (research decision 4)
- `_meta.md` per feature folder carries feature-level frontmatter + pipeline state + history (research decision 5)
- `_meta.md` authoritative status (`active | archived | abandoned`); `thoughts-locator` respects it (research decision 6)
- Optional `external_id` frontmatter per artifact and feature (research decision 7)
- Preserve the implicit organizing principle: `thoughts/` for skill-consumed pipeline artifacts; `.rpiv/` for extension-injected tool infrastructure (research architecture insight 1)
- 4 pipeline producer skills (`discover`, `research`, `design`, `plan`) write into feature folders AND append to `_meta.md`; `explore` produces project-level solutions artifacts at `{base}/solutions/` and does NOT touch feature `_meta.md`
- 3 consumer skills (`resume-handoff`, `implement`, `revise`) read from feature folders
- Sweep phantom `thoughts/me/`, `thoughts/global/`, `thoughts/me/tickets/` references with no producers

## Current State Analysis

### Key Discoveries

- `extensions/rpiv-core/session-hooks.ts:22-28` hardcodes `THOUGHTS_DIRS` with 5 of 9 actually-written directories (`solutions/`, `reviews/`, `tickets/`, `prs/` unscaffolded). Scaffolding is effectively a one-shot no-op after first session.
- `extensions/rpiv-core/session-hooks.ts:39` receives `ctx.cwd` from Pi's session manager — canonical project anchor for any new config reader.
- `extensions/rpiv-core/package-checks.ts:11-23` demonstrates the house config-reading pattern: `existsSync` guard → `try/catch` over `readFileSync`+`JSON.parse` → shape validation → safe default. Duplicate pattern at `agents.ts:86-97` (manifest read).
- **No runtime reads project config today**; no `.rpivrc`, no env vars, no `package.json`-field consumer. This design introduces the first project-config reader in rpiv-core (`.rpiv/config.json`).
- `extensions/rpiv-core/constants.ts` holds three cross-cutting string constants — NOT path literals. A new `artifacts-config.ts` module fits the `siblings.ts`+`package-checks.ts` split (declarative data + separate reader).
- `agents/thoughts-locator.md:4` is `tools: grep, find, ls` — no `read`. Line 125 explicitly forbids reading file contents. Status filtering must grep `_meta.md` frontmatter.
- `agents/thoughts-locator.md:14-15, 38-53` references `thoughts/me/` and `thoughts/global/` — no producer skills exist for these paths (phantom references).
- `skills/plan/SKILL.md:171` references `thoughts/me/tickets/[file].md` in its References template — same phantom class.
- `rpiv-pi/.gitignore:6` ignores `thoughts/`; 57 existing artifacts are local-only, no git history to preserve.
- `skills/outline-test-cases/templates/feature-meta.md` provides the frontmatter-schema precedent for `_meta.md` (adapted: `feature`, `slug`, `status`, `generated`, `git_commit`, `tc_count`).
- Producer skills' chaining commands embed full paths (e.g., `/skill:design thoughts/shared/research/[filename].md` at `research/SKILL.md:278`); these must be updated to emit feature-folder paths.
- `skills/create-handoff/SKILL.md` and `skills/code-review/SKILL.md` produce session/branch-scoped artifacts, not feature-scoped — they stay under `{base}/handoffs/` and `{base}/reviews/` respectively (developer decision).

### Patterns to Follow

- Config-reading shape: `package-checks.ts:13-23` — pure utility, no `ExtensionAPI`, silent fallback on any error
- Module split: `siblings.ts` (declarative `readonly` constants) + `package-checks.ts` (reader that uses them) — mirror for `artifacts-config.ts`
- Agent sync: any change to `agents/*.md` auto-syncs to `.pi/agents/` via `extensions/rpiv-core/agents.ts` — no extra wiring needed
- Timestamp generation: skills use `YYYY-MM-DD_HH-MM-SS` format today; reuse

### Constraints to Work Within

- No tests in repo — verification is type-check + grep sweep + manual trial
- `thoughts-locator` keeps `grep, find, ls` only (load-bearing agent-tier boundary per `.rpiv/guidance/agents/architecture.md`)
- `.rpiv/guidance/**/architecture.md` and `.pi/agents/CLAUDE.md` edits must be surgical (memory: `feedback_guidance_surgical.md`)
- Commit messages: terse, no co-author (memory: `feedback_commit_messages.md`)

## Scope

### Building

1. **`extensions/rpiv-core/artifacts-config.ts`** — new utility module with `DEFAULT_ARTIFACTS_BASE`, `resolveArtifactsBase(cwd)`, helper types
2. **`extensions/rpiv-core/session-hooks.ts`** — replace hardcoded `THOUGHTS_DIRS`; scaffold `{base}/features/`, `{base}/handoffs/`, `{base}/reviews/` only
3. **`skills/discover/templates/feature-meta.md`** — new `_meta.md` template for pipeline artifacts
4. **4 pipeline producer SKILL.md updates**: `discover`, `research`, `design`, `plan` — feature-folder writes + `_meta.md` append + updated chaining commands
5. **1 project-level producer SKILL.md update**: `explore` — writes to `{base}/solutions/`; adds optional `source_feature: {slug}` frontmatter when invoked with a feature-folder upstream path; no `_meta.md` write
6. **3 consumer SKILL.md updates**: `resume-handoff`, `implement`, `revise` — recognize feature folders
7. **2 agent updates**: `thoughts-locator.md` (directory tree, status via `_meta.md` grep, drop phantom paths, output format); `thoughts-analyzer.md` (recognize `_meta.md` as doc type)
8. **Docs sweep**: `README.md`, `.rpiv/guidance/architecture.md`, `.rpiv/guidance/skills/architecture.md`, `.rpiv/guidance/extensions/rpiv-core/architecture.md`

### Not Building

- **Audit/cleanup skill** — deferred (developer decision; `_meta.md` drift is a follow-up)
- **Migration script for existing artifacts** — 57 old files left in place; README tells devs they can delete (gitignored anyway)
- **Linear/Jira integration skill itself** — only the `external_id` frontmatter field is added; sync tooling is future work
- **Sub-artifact referencing** (research Q6) — deferred enhancement
- **`thoughts/me/` and `thoughts/global/` activation** — phantom refs removed; no producer skills introduced
- **Changes to `create-handoff` or `code-review` producer layout** — they stay at `{base}/handoffs/` and `{base}/reviews/`
- **Changes to `outline-test-cases`/`write-test-cases`** — test-case skills are out of scope (research developer decision)

## Decisions

### D1: Configuration surface — `.rpiv/config.json`

Reader lives in new `extensions/rpiv-core/artifacts-config.ts`. Default `thoughts/shared` when file absent or field invalid. Pattern modeled after `package-checks.ts:11-23` (existsSync → try/catch → validated fallback).

**Why `.rpiv/config.json` over `package.json`**: Pi + rpiv-pi can run in any project type (Node, Python, Go, empty scratch dirs) — `package.json` isn't guaranteed. `.rpiv/` already exists as the rpiv-infrastructure tree (`.rpiv/guidance/`, `.rpiv/test-cases/`), so adding `config.json` keeps rpiv configuration co-located with other rpiv tool state.

**Shape:**
```json
{ "artifactsBase": "thoughts/shared" }
```

Top-level field only — `.rpiv/` is already the namespace, no wrapper object needed.

**Evidence**: developer checkpoint (cascade revision 2026-04-16); research open question 1.

### D2: Feature-slug authoring + collision

- `discover` skill (pipeline root) derives slug from topic: kebab-case, first 3–5 meaningful words, lowercase, hyphens only.
- Collision: glob `{base}/features/{slug}/`. If absent, use. If present, grep `^feature:` in its `_meta.md`: title match → reuse the folder (Edit-mode `_meta.md` update); title differs or `_meta.md` is missing → append numeric suffix (`{slug}-2`, `{slug}-3`, …) and retry the glob until unused.
- Downstream skills extract the slug from the upstream artifact path argument.

**Evidence**: research open question 3; research architecture insight 2.

### D3: `_meta.md` schema — frontmatter for state, prose for history

Canonical schema lives in `skills/discover/templates/feature-meta.md` (see Architecture). Frontmatter: `feature`, `slug`, `status`, `external_id`, `created`, `last_updated`, `current_{questions,research,design,plan}`, `git_commit`. Body: `## Artifacts`, `## Pipeline History`, `## Scope Decisions`, `## Checkpoint History`. The trailing HTML-comment `## Producer Contract` block in the template is the single source of truth for how producers update the file.

**Contract-source hybrid** (assessment revision): Mechanical update steps (bump `last_updated`, append Artifacts line, append Pipeline History line) live ONLY in the template's Producer Contract. Producer SKILL.md blocks name ONLY skill-specific values — which `current_*` pointer advances and the Pipeline History text. This matches the outline-test-cases template-as-contract precedent (`skills/outline-test-cases/SKILL.md:240, 338`) and avoids six-way drift across producer skills. Revisiting a dedicated `/skill:update-meta` helper was rejected: it would add one LLM turn per pipeline step and is not the current chaining idiom (chaining is user-driven via explicit `/skill:<name> <path>` invocations).

**Evidence**: `skills/outline-test-cases/templates/feature-meta.md:3-10` precedent adapted; research architecture insight 4.

### D4: `thoughts-locator` status filtering via `_meta.md` grep

Agent keeps `tools: grep, find, ls`. New search step: `grep "^status:" features/*/_meta.md` to categorize feature folders. Output format groups by status (active vs archived).

**Evidence**: developer checkpoint, research open question 6.

### D5: Producer scope — pipeline only

Feature folders hold only `discover`/`research`/`design`/`plan` artifacts. `explore` stays at `{base}/solutions/`, `create-handoff` at `{base}/handoffs/`, `code-review` at `{base}/reviews/` — they're analysis/session/branch-scoped, not feature-scoped. When `explore` is invoked with a feature-folder artifact path as its argument, it adds `source_feature: {slug}` to the solutions artifact's frontmatter so thoughts-locator can cross-reference, but still writes to `{base}/solutions/` and never touches any feature `_meta.md`.

**Evidence**: developer checkpoint; assessment feedback #2 (solutions are non-linear — no `current_*` advance — so co-location into feature folders added a mode branch without benefit).

### D6: Migration — leave in place

57 existing `thoughts/shared/{type}/*.md` files stay where they are. README adds a note: "If you have old artifacts from a prior rpiv-pi version, you may delete `thoughts/shared/{research,questions,designs,plans,solutions}/` (they're gitignored)."

**Evidence**: developer checkpoint, research open question 2.

### D7: Scaffolding — dynamic from resolver, four subfolders

`session-hooks.ts` drops the 5-element `THOUGHTS_DIRS` literal and calls `resolveScaffoldDirs(cwd)` → `{base}/features/`, `{base}/solutions/`, `{base}/handoffs/`, `{base}/reviews/`. Feature folders are created on-demand by `discover`.

**Evidence**: research Q1; discover owns feature-folder creation.

### D8: Remove phantom `thoughts/me/` + `thoughts/global/` references

Remove from `agents/thoughts-locator.md:14-15, 38-53, 49-52, 95` and `skills/plan/SKILL.md:171`. No producer skills exist for these paths.

**Evidence**: research architecture insight 6.

## Architecture

### extensions/rpiv-core/artifacts-config.ts — NEW

New utility: reads `.rpiv/config.json` `artifactsBase`, returns resolved base path + scaffold dirs. Pure utility — no `ExtensionAPI`.

```typescript
/**
 * Project-level artifact layout configuration.
 *
 * Reads `.rpiv/config.json` `artifactsBase` (relative path) with a safe default
 * of "thoughts/shared". Fallback applies on missing file, missing field,
 * parse error, or non-string value — consistent with the fail-soft posture
 * of package-checks.ts.
 *
 * `.rpiv/config.json` is chosen over `package.json` because Pi + rpiv-pi run
 * in non-Node projects too; `package.json` isn't guaranteed. `.rpiv/` already
 * holds other rpiv infrastructure (`guidance/`, `test-cases/`).
 *
 * Pure utility — no ExtensionAPI.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_ARTIFACTS_BASE = "thoughts/shared";

/**
 * Subdirectories scaffolded unconditionally inside the base path.
 * `features/` holds pipeline artifacts (discover → plan).
 * `solutions/` holds non-linear analysis artifacts from `explore`.
 * `handoffs/` and `reviews/` hold session- and branch-scoped artifacts.
 */
export const SCAFFOLD_SUBDIRS = ["features", "solutions", "handoffs", "reviews"] as const;

const CONFIG_RELATIVE_PATH = join(".rpiv", "config.json");

/**
 * Resolve the artifacts base path for the given project cwd.
 * Returns the `artifactsBase` string from `.rpiv/config.json` if valid,
 * otherwise the default. Never throws.
 */
export function resolveArtifactsBase(cwd: string): string {
	const configPath = join(cwd, CONFIG_RELATIVE_PATH);
	if (!existsSync(configPath)) return DEFAULT_ARTIFACTS_BASE;
	try {
		const raw = readFileSync(configPath, "utf-8");
		const config = JSON.parse(raw) as { artifactsBase?: unknown };
		const candidate = config.artifactsBase;
		if (typeof candidate !== "string" || candidate.length === 0) {
			return DEFAULT_ARTIFACTS_BASE;
		}
		return candidate;
	} catch {
		return DEFAULT_ARTIFACTS_BASE;
	}
}

/**
 * Absolute paths to scaffold at session_start, derived from the resolved base.
 * Feature folders themselves are created on-demand by the discover skill.
 */
export function resolveScaffoldDirs(cwd: string): string[] {
	const base = resolveArtifactsBase(cwd);
	return SCAFFOLD_SUBDIRS.map((sub) => join(cwd, base, sub));
}
```

### extensions/rpiv-core/session-hooks.ts:22-28,87-91 — MODIFY

Replace `THOUGHTS_DIRS` constant and `scaffoldThoughtsDirs` helper with calls to the new resolver. Drop the now-unused `join` import.

```typescript
// Replace the `import { join } from "node:path";` line (currently line 9)
// with the import below; drop line 9 entirely.
import { resolveScaffoldDirs } from "./artifacts-config.js";

// Delete the `THOUGHTS_DIRS` constant entirely (currently lines 22-28).

// Replace `scaffoldThoughtsDirs` body (currently lines 87-91) with:
function scaffoldThoughtsDirs(cwd: string): void {
	for (const dir of resolveScaffoldDirs(cwd)) {
		mkdirSync(dir, { recursive: true });
	}
}
```

### skills/discover/templates/feature-meta.md — NEW

Per-feature `_meta.md` template. Cited by all pipeline producers. The trailing `## Producer Contract` block is the single source of truth for how producers update this file.

```markdown
---
feature: "{Human-readable title}"
slug: {feature-slug}
status: active
external_id: ""
created: {YYYY-MM-DD}
last_updated: {YYYY-MM-DD}
current_questions: ""
current_research: ""
current_design: ""
current_plan: ""
git_commit: {commit-hash}
---

## Artifacts
- {YYYY-MM-DD HH:MM} — {type} ({producer}) → {filename}

## Pipeline History
- {YYYY-MM-DD HH:MM} {producer}: {one-line note}

## Scope Decisions
_Appended by checkpoints._

## Checkpoint History
_Appended by checkpoints._

<!--
## Producer Contract — single source of truth (inter-skill contract)
This comment block is the canonical mechanical spec. Producer SKILL.md files MUST NOT restate steps 1–4; they specify only skill-specific values (which `current_*` pointer advances and the Pipeline History text). Matches the outline-test-cases template-as-contract precedent (skills/outline-test-cases/SKILL.md:240, 338).

Every pipeline skill (discover, research, design, plan, revise) that writes an artifact into this feature folder MUST perform the following mechanical steps, in order:
1. Edit frontmatter: `last_updated` → today; for typed producers (research/design/plan), `current_{type}` → new filename (bare, no path). Discover, on seed only, also initializes `feature`, `slug`, `created`, `git_commit`.
2. Append one line to `## Artifacts`: `- {YYYY-MM-DD HH:MM} — {type} ({producer}) → {filename}`
3. Append one line to `## Pipeline History`: `- {YYYY-MM-DD HH:MM} {skill}: {one-line note}`
4. Optional: append to `## Scope Decisions` (design) or `## Checkpoint History` (any).

Never edit `created`, `slug`, `git_commit`, or prior Artifacts/History lines. `status` is authoritative — only user/audit skill changes it.

`explore` does NOT participate in this contract: it writes to `{base}/solutions/` and never edits any feature-folder `_meta.md`.
-->
```

### skills/discover/SKILL.md — MODIFY

**L3 description:** replace `thoughts/shared/questions/` → `{base}/features/{slug}/` (default base: `thoughts/shared`).

**Step 6 replacement (L169-208):**

```markdown
### Step 6: Write Questions Artifact

1. **Resolve `{base}`**: Read `.rpiv/config.json`; use `artifactsBase` string if present, else `thoughts/shared`.
2. **Derive `{slug}` and resolve collision**: kebab-case 3–5 meaningful words of the topic. Glob `{base}/features/{slug}/`. If the folder does not exist, proceed. If it exists, grep `^feature:` in `{base}/features/{slug}/_meta.md`: if the existing title matches the current topic's derived title, reuse the folder (Edit-mode update of `_meta.md`); if the title differs, or `_meta.md` is missing, append numeric suffix (`{slug}-2`, `{slug}-3`, …) and retry the glob until unused.
3. **Write** `{base}/features/{slug}/questions_YYYY-MM-DD_HH-MM-SS.md` using the standard questions-artifact frontmatter (add `external_id: ""`).
4. **Seed or update `_meta.md`** per the Producer Contract in `skills/discover/templates/feature-meta.md`. Skill-specific values: on a new folder, copy the template and initialize `feature`, `slug`, `created`, `git_commit` (per contract step 1 addendum for the seed case); set `current_questions` → new filename; Pipeline History line → `discover: seeded feature from topic "{topic}"`. On a reused folder, Edit the existing `_meta.md` — do not overwrite.
```

**Step 7 replacement (L212-221):**

```markdown
### Step 7: Present and Chain

\`\`\`
Feature folder: `{base}/features/{slug}/`
Questions:      `{base}/features/{slug}/questions_{timestamp}.md`
Meta:           `{base}/features/{slug}/_meta.md`

Next: `/skill:research {base}/features/{slug}/questions_{timestamp}.md`
\`\`\`
```

### skills/research/SKILL.md — MODIFY

**L3 description:** replace `thoughts/shared/research/` → `{base}/features/{slug}/research_{timestamp}.md`.

**Step 1 addition (after "Questions artifact provided"):** "Split the input path on `/features/` to get `{base}` and `{slug}`."

**Step 4 (L181-208) replacement:**

```markdown
1. Metadata: filename `{base}/features/{slug}/research_YYYY-MM-DD_HH-MM-SS.md`; repo from git root; branch/commit from injected git context; researcher from injected User (fallback "unknown").
2. Write the research artifact using the existing template with two frontmatter additions: `external_id: ""`, and `questions_source` pointing to the feature-folder path.
3. Update `_meta.md` per the Producer Contract in `skills/discover/templates/feature-meta.md`. Skill-specific values: `current_research` → new filename; Pipeline History line → `research: answered [N] questions across [K] files`.
```

**Step 5 replacement (L267-279):**

```markdown
## Step 5: Present and Chain

\`\`\`
Research: `{base}/features/{slug}/research_{timestamp}.md`
Meta:     `current_research` updated.

Next: `/skill:design {base}/features/{slug}/research_{timestamp}.md`
\`\`\`
```

### skills/design/SKILL.md — MODIFY

**L3 description:** replace `thoughts/shared/designs/` → `{base}/features/{slug}/design_{timestamp}.md`.

**Step 1 addition (after "Research artifact provided"):** "Split the input path on `/features/` to get `{base}` and `{slug}`."

**Step 6 skeleton-artifact substep (L208-214) replacement:**

```markdown
4. Write skeleton to `{base}/features/{slug}/design_YYYY-MM-DD_HH-MM-SS.md` with `status: in-progress`. Frontmatter adds `external_id: ""` and `research_source` pointing to the feature-folder path. Body sections unchanged from existing template.
```

**Step 9 (Finalize) addition (new substep):**

```markdown
4. Update `_meta.md` per the Producer Contract in `skills/discover/templates/feature-meta.md`. Skill-specific values: `current_design` → new filename; Pipeline History line → `design: [S] slices, [R] revisions`.
```

**Step 10 chaining (L345-360) replacement:**

```markdown
1. \`\`\`
   Design: `{base}/features/{slug}/design_{timestamp}.md`
   Meta:   `current_design` updated.

   [N] decisions fixed, [M] new files, [K] modified; [S] slices, [R] revisions.

   Next: `/skill:plan {base}/features/{slug}/design_{timestamp}.md`
   \`\`\`
```

### skills/plan/SKILL.md — MODIFY

**L3 description:** replace `thoughts/shared/plans/` → `{base}/features/{slug}/plan_{timestamp}.md`.

**L17 input-guard + L28 example:** update example paths to feature-folder form.

**Step 3 "Write Plan" (L70-81) replacement:**

```markdown
0. Split the input design path on `/features/` to get `{base}` and `{slug}`.
1. Write the plan skeleton to `{base}/features/{slug}/plan_YYYY-MM-DD_HH-MM-SS.md`. Frontmatter adds `external_id: ""`; `design_source` is the full feature-folder path. Body sections unchanged.
2. Fill code blocks via Edit, one phase at a time (unchanged).
3. Update `_meta.md` per the Producer Contract in `skills/discover/templates/feature-meta.md`. Skill-specific values: `current_plan` → new filename; Pipeline History line → `plan: [P] phases, [C] success criteria`.
```

**Step 3 References template (L167-171):** drop the `thoughts/me/tickets/` line; replace remaining lines with `{base}/features/{slug}/design_{timestamp}.md` and `{base}/features/{slug}/research_{timestamp}.md`.

**Step 4 chaining (L179-188) replacement:**

```markdown
1. \`\`\`
   Plan: `{base}/features/{slug}/plan_{timestamp}.md`
   Meta: `current_plan` updated.

   [N] phases, [M] files.

   Next: `/skill:implement {base}/features/{slug}/plan_{timestamp}.md Phase 1`
   \`\`\`
```


### skills/explore/SKILL.md — MODIFY

**L3 description:** resolve `{base}` from `.rpiv/config.json` (default `thoughts/shared`); writes `{base}/solutions/solutions_{timestamp}.md`. `explore` remains project-level — not a feature-folder producer.

**Step 1 addition:**

```markdown
- **Resolve `{base}`**: Read `.rpiv/config.json`; use `artifactsBase` string if present, else `thoughts/shared`.
- **Detect source feature (optional)**: if the argument is a path matching `**/features/{slug}/**.md`, extract `{slug}` and record it as the solution's source feature. Otherwise proceed as a standalone topic.
```

**Step 5 metadata replacement:**

```markdown
5. Filename `{base}/solutions/solutions_YYYY-MM-DD_HH-MM-SS.md`; repo/branch/commit from git context; researcher from injected User (fallback "unknown").
```

**Step 6 frontmatter:** add `external_id: ""` and `source_feature: {slug}` (empty string when invoked standalone). When `{slug}` is present, also set `questions_source` / `research_source` to feature-folder paths if those artifacts exist.

**No `_meta.md` write.** Solutions are non-linear; `explore` does not participate in the feature-folder `_meta.md` contract. The source feature's `_meta.md` (if any) is NOT modified by `explore`.

**Step 7:** print the solutions path; suggest `/skill:design {base}/solutions/solutions_{timestamp}.md` as the likely next step (not mandatory).


### skills/resume-handoff/SKILL.md — MODIFY

**L18 replacement:**

```markdown
- Immediately read any artifacts the handoff links to, following paths as written — typically inside `{base}/features/{slug}/`. If a linked path is in a feature folder, also read that folder's `_meta.md` to recover pipeline state. Use Read directly; do NOT invoke skills here.
```

**L191 example:** illustrative path update only (use a feature-folder artifact path). L28 handoff path unchanged — handoffs stay at `{base}/handoffs/`.


### skills/implement/SKILL.md — MODIFY

**L11 replacement:** `implementing an approved technical plan from \`{base}/features/{slug}/plan_{timestamp}.md\`.`

(Path-agnostic behavior; only the prose changes.)


### skills/revise/SKILL.md — MODIFY

Example-path updates at L17, L26, L135, L222, L228, L238: replace `thoughts/shared/plans/…_feature.md` with `thoughts/shared/features/add-oauth/plan_2026-04-16_13-20-00.md`.

**L28 shell hint replacement:** `Tip: list recent plans with \`ls -lt thoughts/shared/features/*/plan_*.md | head\``

**Add one line to Step 4 (or equivalent write-back step):** "When the plan lives in a feature folder, also update `_meta.md` per the Producer Contract in `skills/discover/templates/feature-meta.md`. Skill-specific values: no `current_*` advance (revise edits in place); Pipeline History line → `revise: updated plan ({one-line summary})`."


### agents/thoughts-locator.md — MODIFY

Frontmatter unchanged (`tools: grep, find, ls`, `isolated: true`).

**Core Responsibilities (L10-32) replacement:**

```markdown
## Core Responsibilities

1. Search the artifacts tree (default `thoughts/shared/`; overridable via `.rpiv/config.json` `artifactsBase`): feature folders `{base}/features/{slug}/`, plus `{base}/handoffs/` and `{base}/reviews/`.
2. Categorize by feature (then by artifact type within) and by project-level subdir for handoffs/reviews.
3. Respect feature lifecycle: grep `^status:` inside `{base}/features/*/_meta.md` and group by `active | archived | abandoned`.
```

**Directory Structure (L38-53) replacement:**

```markdown
### Directory Structure
\`\`\`
{base}/                        # default: thoughts/shared
├── features/
│   └── {slug}/
│       ├── _meta.md
│       ├── questions_YYYY-MM-DD_HH-MM-SS.md
│       ├── research_YYYY-MM-DD_HH-MM-SS.md
│       ├── design_YYYY-MM-DD_HH-MM-SS.md
│       └── plan_YYYY-MM-DD_HH-MM-SS.md
├── solutions/
├── handoffs/
└── reviews/
\`\`\`
```

**Search Patterns (L55-59) replacement:**

```markdown
### Search Patterns
- grep: content search across feature folders
- glob: `{base}/features/*/_meta.md`, `{base}/features/*/research_*.md`
- `ls`: list feature folders
- `grep "^status:" {base}/features/*/_meta.md`: filter by lifecycle
```

**Output Format (L60-99) replacement:**

```markdown
## Output Format

\`\`\`
## Thought Documents about [Topic]

### Active Features
- `{base}/features/{slug}/` (status: active, created: YYYY-MM-DD)
  - `_meta.md`
  - `questions_…md` — [snippet]
  - `research_…md`  — [snippet]
  - tags: […]

### Archived Features
- `{base}/features/{other-slug}/` (status: archived)

### Solutions
- `{base}/solutions/…md` — [snippet] (source_feature: {slug} if present)

### Handoffs
- `{base}/handoffs/…md` — [snippet]

### Reviews
- `{base}/reviews/…md` — [snippet]

Total: N features (A active, Z archived), S solutions, H handoffs, R reviews
Artifact chain: questions → research → design → plan ([K] linked in {slug})
\`\`\`
```

**Search Tips (L101-121):**
- Drop phantom-location bullets (`me/`, `global/`).
- Add: "Check `_meta.md` `current_*` pointers for the canonical latest artifact of each type."
- Extend frontmatter field list at L116 with `feature`, `slug`, `current_questions`, `current_research`, `current_design`, `current_plan`, `external_id`.

**Important Guidelines (L123-129):** keep "Don't read full file contents"; add "Group archived/abandoned features separately so callers can filter."


### agents/thoughts-analyzer.md — MODIFY

**Step 1 addition:**

```markdown
- For `_meta.md`: extract state (status, created, last_updated, `current_*`), the last 3–5 Pipeline History entries, and Scope Decisions. Skip full-file summaries.
```

**Output Format Document Context (L62-68) replacement:**

```markdown
### Document Context
- **Date**: frontmatter `date:`
- **Type**: Research / Solution Analysis / Design / Plan / Review / Handoff / Feature Meta
- **Purpose**: frontmatter `topic:` or `feature:`
- **Status**: frontmatter `status:` (active/archived/abandoned for `_meta.md`; complete/ready/resolved/superseded for artifacts)
- **Upstream**: `questions_source` / `research_source` / `design_source` if present
- **Feature**: parent folder's `_meta.md` `slug:` / `feature:` when analyzed file is inside `{base}/features/{slug}/`
```


### README.md — MODIFY

**L78 (scaffolding bullet):** `Scaffolds the artifacts tree at session start: \`thoughts/shared/features/\`, \`.../solutions/\`, \`.../handoffs/\`, \`.../reviews/\` (base overridable via \`.rpiv/config.json\`)`

**L85-91 (Typical Workflow):** replace paths with `thoughts/shared/features/<slug>/{questions,research,design,plan}_<timestamp>.md`.

**L103-106 + L112 (skills tables Output column):** update feature-folder pipeline rows (`discover`, `research`, `design`, `plan`) to `thoughts/shared/features/<slug>/{type}_*.md`. Update `explore` row to `thoughts/shared/solutions/solutions_*.md`. Non-pipeline rows unchanged.

**L172-175 (Architecture tree):** replace last line with `└── thoughts/shared/        — pipeline artifact store (features/<slug>/ + solutions/ + handoffs/ + reviews/)`.

**L179 (Configuration section):** add bullet as first item — `**Artifacts base path** — default \`thoughts/shared/\`. Override in \`.rpiv/config.json\` with \`{ "artifactsBase": ".rpiv/artifacts" }\``

**After L79 (First Session):** append blockquote — `> Upgrading from a pre-feature-folder install? Old artifacts under \`thoughts/shared/{research,questions,designs,plans,solutions}/\` are gitignored and no longer used — delete if desired.`


### .rpiv/guidance/architecture.md — MODIFY

**L13 replacement:** `└── thoughts/shared/        — Pipeline artifact store: features/{slug}/ (discover→plan) + solutions/ + handoffs/ + reviews/`


### .rpiv/guidance/skills/architecture.md — MODIFY

**L9 replacement:** `- **\`extensions/rpiv-core/\`**: session-time scaffolding (artifacts tree), guidance injection, git-context injection, bundled-agent sync`


### .rpiv/guidance/extensions/rpiv-core/architecture.md — MODIFY

**L4:** replace `thoughts/ scaffold` → `artifacts-tree scaffold` inline (no other changes).


## Desired End State

```bash
# After session_start, the workspace scaffold looks like this:
$ tree thoughts/shared
thoughts/shared
├── features/          # pipeline artifacts (discover → plan)
├── solutions/         # non-linear analysis (explore)
├── handoffs/          # session snapshots (create-handoff)
└── reviews/           # PR/branch reviews (code-review)

# Discover creates a feature folder on first run:
$ /skill:discover Add OAuth token refresh
$ tree thoughts/shared/features
thoughts/shared/features
└── add-oauth-token-refresh/
    ├── _meta.md
    └── questions_2026-04-16_09-12-00.md

# Pipeline runs co-locate into the same folder:
$ /skill:research thoughts/shared/features/add-oauth-token-refresh/questions_2026-04-16_09-12-00.md
$ /skill:design thoughts/shared/features/add-oauth-token-refresh/research_2026-04-16_10-30-00.md
$ /skill:plan thoughts/shared/features/add-oauth-token-refresh/design_2026-04-16_11-45-00.md

$ tree thoughts/shared/features/add-oauth-token-refresh
thoughts/shared/features/add-oauth-token-refresh
├── _meta.md                                     # updated after each producer
├── questions_2026-04-16_09-12-00.md
├── research_2026-04-16_10-30-00.md
├── design_2026-04-16_11-45-00.md
└── plan_2026-04-16_13-20-00.md

# _meta.md tracks pipeline state:
$ cat thoughts/shared/features/add-oauth-token-refresh/_meta.md
---
feature: "Add OAuth token refresh"
slug: add-oauth-token-refresh
status: active
external_id: ""
created: 2026-04-16
last_updated: 2026-04-16
current_questions: questions_2026-04-16_09-12-00.md
current_research: research_2026-04-16_10-30-00.md
current_design: design_2026-04-16_11-45-00.md
current_plan: plan_2026-04-16_13-20-00.md
git_commit: d271bdd
---

## Artifacts
- 2026-04-16 09:12 — questions (claude-code) → questions_2026-04-16_09-12-00.md
- 2026-04-16 10:30 — research (claude-code) → research_2026-04-16_10-30-00.md
- 2026-04-16 11:45 — design (claude-code) → design_2026-04-16_11-45-00.md
- 2026-04-16 13:20 — plan (claude-code) → plan_2026-04-16_13-20-00.md

## Pipeline History
- 2026-04-16 09:12 discover: seeded feature from topic "Add OAuth token refresh"
- 2026-04-16 10:30 research: answered 8 questions across 14 files
- 2026-04-16 11:45 design: 3 decisions fixed, 5 files designed
- 2026-04-16 13:20 plan: 4 phases, 11 success criteria
```

```jsonc
// Project opts out of the default via .rpiv/config.json:
{
  "artifactsBase": ".rpiv/artifacts"
}
```

## File Map

```
extensions/rpiv-core/artifacts-config.ts           # NEW — config reader + scaffold-dir helper
extensions/rpiv-core/session-hooks.ts              # MODIFY — consume resolver
skills/discover/templates/feature-meta.md          # NEW — _meta.md template
skills/discover/SKILL.md                           # MODIFY — feature-folder write, _meta.md create, chaining
skills/research/SKILL.md                           # MODIFY — slug from upstream path, _meta.md append
skills/design/SKILL.md                             # MODIFY — same pattern
skills/plan/SKILL.md                               # MODIFY — same pattern + phantom ref drop
skills/explore/SKILL.md                            # MODIFY — project-level solutions path; optional source_feature frontmatter
skills/resume-handoff/SKILL.md                     # MODIFY — feature-folder recognition
skills/implement/SKILL.md                          # MODIFY — prose updates
skills/revise/SKILL.md                             # MODIFY — prose updates
agents/thoughts-locator.md                         # MODIFY — tree, status grep, drop me/global
agents/thoughts-analyzer.md                        # MODIFY — _meta.md doc type
README.md                                          # MODIFY — tree, pipeline, config doc
.rpiv/guidance/architecture.md                     # MODIFY — tree + pipeline prose
.rpiv/guidance/skills/architecture.md              # MODIFY — scaffolding mention
.rpiv/guidance/extensions/rpiv-core/architecture.md # MODIFY — scaffolding mention
```

## Ordering Constraints

- **Slice 1 (config foundation) must land before any producer skill** — scaffolding shape changes
- **Slice 2 (discover + template) must land before slices 3/4** — they inherit the `_meta.md` convention
- **Slices 3/4 can run in parallel in theory but are sequenced** for simplicity
- **Slice 5 (consumers) depends on slices 3/4** — reads what they produce
- **Slice 6 (agents) depends on slice 2** — agents read `_meta.md`
- **Slice 7 (docs) lands last** — describes the end state

## Verification Notes

- Type-check passes after slice 1 (`pnpm -s tsc --noEmit` or equivalent)
- Grep `thoughts/shared/\(research\|questions\|designs\|plans\|solutions\)/` across `skills/ agents/ extensions/ .rpiv/ README.md` → zero hits (except intentional migration notices)
- Grep `thoughts/me/\|thoughts/global/` → zero hits in agents/skills
- End-to-end `discover → research → design → plan` on a toy topic: feature folder appears, `_meta.md` updates after each step, `current_*` frontmatter advances
- thoughts-locator categorizes a `status: archived` feature separately from active
- Fresh session without `.rpiv/config.json` uses default base; no errors
- Session with `.rpiv/config.json` `{ "artifactsBase": ".rpiv/artifacts" }` scaffolds `.rpiv/artifacts/features/`
- Edit `agents/thoughts-locator.md` → `/rpiv-update-agents` reconciles the `.pi/agents/` mirror

## Performance Considerations

- One `readFileSync` of `.rpiv/config.json` at `session_start` — negligible
- Feature folders created on-demand by discover, not per-session
- `grep "^status:" features/*/_meta.md` cheap (one small file per feature)
- No tree-wide scan: producers edit only their own feature's `_meta.md`

## Migration Notes

- Existing `thoughts/shared/{research,questions,designs,plans,solutions}/*.md` (57 gitignored files) remain untouched; README tells devs they can delete
- Rollback: revert the 17-file commit; old scaffolding constant restores. Any new feature folders become inert (no producer writes there).
- `_meta.md` is v1; future schema changes should add a `_meta_version` field first

## Pattern References

- `extensions/rpiv-core/package-checks.ts:11-23` — template for the `artifacts-config.ts` config reader shape
- `extensions/rpiv-core/agents.ts:86-97` — second instance of the same read-with-fallback pattern
- `extensions/rpiv-core/siblings.ts:22-48` — declarative `readonly` export idiom for the default-base constant
- `skills/outline-test-cases/templates/feature-meta.md:3-10` — `_meta.md` frontmatter schema precedent
- `extensions/rpiv-core/session-hooks.ts:39-51` — session_start hook shape (how the new resolver is called)
- `extensions/rpiv-core/guidance.ts:123-153` — `injectRootGuidance` silent-failure posture for session-scoped reads

## Developer Context

**Q1 (Config surface):** where to read base path from? → `.rpiv/config.json` (revised 2026-04-16 from initial `package.json` — Pi runs in non-Node projects too; `.rpiv/` is already the rpiv namespace). Cascade-applied to Slice 1.

**Q2 (Audit/cleanup scope):** ship audit skill now? → Defer. Ship structure only.

**Q3 (Locator status consumption):** how does thoughts-locator respect `_meta.md` status? → Grep frontmatter (`^status:` in `*/_meta.md`). Agent keeps `tools: grep, find, ls`.

**Q4 (Migration for 57 gitignored artifacts):** → Leave in place. README tells devs they can delete.

**Q5 (Producer scope):** which skills write inside feature folders? → Feature-folder producers: discover, research, design, plan. `explore` stays project-level at `{base}/solutions/` (assessment revision 2026-04-16). create-handoff stays `{base}/handoffs/`; code-review stays `{base}/reviews/`.

## Design History

- Slice 1: Config foundation — approved; revised 2026-04-16: config source changed from `package.json` `rpiv` field to `.rpiv/config.json` (cascade from Slice 2 concern — Pi projects aren't all Node projects); revised again 2026-04-16 post-assessment: `SCAFFOLD_SUBDIRS` adds `solutions` (now four entries) to scaffold explore's project-level output directory
- Slice 2: `_meta.md` template + discover — approved; revised before lock (config source `.rpiv/config.json`); revised 2026-04-16 post-assessment: template Producer Contract promoted to single-source-of-truth (producer SKILL.md blocks no longer restate mechanical steps); discover collision rule made explicit via `_meta.md` `^feature:` grep
- Slice 3: research + design + plan — approved as generated; revised 2026-04-16 post-assessment: producer blocks replaced step-by-step restatements with skill-specific-values references to the template's Producer Contract
- Slice 4: explore — approved as generated; revised 2026-04-16 post-assessment: dropped mode branching and `_meta.md` seeding; explore writes only to `{base}/solutions/` with optional `source_feature: {slug}` frontmatter when invoked with a feature-folder upstream path (rationale: solutions are non-linear and advance no `current_*` pointer — mode branching added complexity without benefit)
- Slice 5: resume-handoff + implement + revise — approved as generated; revised 2026-04-16 post-assessment: revise step references Producer Contract with skill-specific values (no `current_*` advance)
- Slice 6: thoughts-locator + thoughts-analyzer — approved as generated; revised 2026-04-16 post-assessment: added project-level `Solutions` section to output format; directory tree shows `solutions/` at project level (not under feature folders)
- Slice 7: docs sweep — approved as generated; revised 2026-04-16 post-assessment: README tree/scaffolding/explore-row and `.rpiv/guidance/architecture.md` tree line include `solutions/` at project level
- Post-assessment revision 2026-04-16 (summary): (1) contract-source hybrid — mechanical steps canonical in template's Producer Contract only, producer SKILL.md blocks name only skill-specific values (avoids six-way drift); (2) explore stays project-level at `{base}/solutions/` (no mode branching, no `_meta.md` write); (4) discover collision rule made explicit via `_meta.md` `^feature:` title grep

## References

- Research: `thoughts/shared/research/2026-04-15_23-28-56_artifact-organization-strategy.md`
- Questions: `thoughts/shared/questions/2026-04-15_22-51-49_artifact-organization-strategy.md`
- `_meta.md` schema precedent: `skills/outline-test-cases/templates/feature-meta.md`
- Config-reader pattern: `extensions/rpiv-core/package-checks.ts:11-23`
- Pipeline-consumer-as-contract precedent: `skills/outline-test-cases/SKILL.md:338`
