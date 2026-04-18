---
date: 2026-04-17T07:19:49-0400
designer: Claude Code
git_commit: d271bdd
branch: main
repository: rpiv-pi
topic: "Restructure skills/explore/SKILL.md into option-shopping flow with candidate checkpoint and per-candidate fit dispatch"
tags: [design, explore, option-shopping, candidate-generation, dimension-checkpoint, fit-dispatch, skill-rewrite]
status: complete
research_source: "thoughts/shared/research/2026-04-17_01-36-58_explore-discover-question-generation.md"
last_updated: 2026-04-17
last_updated_by: Claude Code
last_updated_note: "Finalized after 4-slice generation; all slices approved as written, integration verified."
---

# Design: Explore — Option-Shopping Flow with Candidate Checkpoint

## Summary

Replace `skills/explore/SKILL.md`'s implicit candidate-generation step with an explicit two-phase flow: Step 2 generates 2–4 named candidates (web-search-researcher promoted to primary; orchestrator enumerates design-space; merges user shortlist), Step 2.5 lets the developer confirm candidates and drop irrelevant dimensions, then Step 3 fans out one codebase-analyzer + one web-search-researcher per candidate to score it on the kept codebase- and external-anchored dimensions. Step 4's recommendation template gains a conditional "no candidate clears the fit filter" branch. All edits land in one file; output path, frontmatter, and downstream contract with `design` are unchanged.

## Requirements

- Treat candidate-generation as a first-class step (not an implicit post-dispatch enumeration) — research Summary
- Promote `web-search-researcher` from optional to primary Step 2 agent — research Architecture Insight 4
- Insert a developer checkpoint before expensive per-candidate dispatch fan-out — research Step 2.5 proposal; matches `discover` Step 5 / `research` Step 3 precedent
- Per-candidate × per-anchor-type fit dispatch in Step 3, scoring kept dimensions per candidate — research Step 3 restructure
- Preserve the non-linearity invariant: writes to `{base}/solutions/`, never touches feature `_meta.md` — `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:131`
- Honest output when no candidate clears the fit filter — developer decision (Step 4 ambiguity #3)
- Single file edit; in-place rewrite, no v1 coexistence — memory rule `feedback_skill_redesign_no_coexistence.md`

## Current State Analysis

### Key Discoveries

- `skills/explore/SKILL.md:34-44` — today's Step 2 spawns 5 role-based agents (`codebase-locator`, `codebase-analyzer`, `codebase-pattern-finder`, `thoughts-locator`, optional `web-search-researcher`) against the raw user topic. No pre-decomposition, no candidate enumeration, no slicing.
- `skills/explore/SKILL.md:46-57` — today's Step 3 enumerates "2-4 viable approaches" post-dispatch. Candidate-generation is implicit and unstructured.
- `skills/explore/SKILL.md:135-198` — Solution Options + Comparison + Recommendation template. Comparison columns at `:161-165` already include "Codebase fit" — fit-as-dimension is an established convention.
- `skills/discover/SKILL.md:138-168` — developer checkpoint precedent: `ask_user_question` 2-option ("Looks good" / "I want to adjust").
- `skills/research/SKILL.md:104-143` — developer checkpoint precedent: grounded `❓ Question:` free-text + tool form with file:line evidence.
- `skills/outline-test-cases/SKILL.md:218,224` — kill-switch precedent: third option "Re-run discovery" / "Force re-scan" — model for "Re-generate candidates".
- Three-way checkpoint pattern is dominant across the codebase: `skills/plan/SKILL.md:64`, `skills/design/SKILL.md:176,206,288,322`, `skills/outline-test-cases/SKILL.md:185` — verb-first labels, exactly one Recommended, parenthetical describes next concrete action.
- `agents/web-search-researcher.md:4` — tools `web_search, web_fetch, read, grep, find, ls`; output schema (Summary / Detailed Findings / Additional Resources / Gaps) maps cleanly onto per-candidate external-dimension findings.
- `agents/codebase-analyzer.md:4-8` — tools `read, grep, find, ls`; output schema (Overview / Entry Points / Core Implementation / Data Flow / Key Patterns) maps onto per-candidate codebase-fit findings.

### Patterns to Follow

- Question form: `Use the ask_user_question tool with the following question: "..."`. Header: "...". Options: "Label (Recommended)" (description); "Label" (description). — prose form, not raw code.
- Three-way checkpoint slots: 1 = Proceed/Approve (Recommended), 2 = edit-in-place (Adjust …), 3 = kill-switch ("Re-…" with phrasing like "Something looks wrong / candidates look wrong").
- Parallel-agent step heading suffix: `(parallel agents)`; close with explicit "Wait for ALL agents to complete before proceeding." sync barrier — per `.rpiv/guidance/skills/architecture.md`.
- Sub-numbered step ("Step 2.5") permitted because integration scan shows zero external file depends on explore's step numbering.
- In-place section replacement preferred over insert+renumber (precedent `7f7f25c` design-feature-iterative dimension sweep).

### Constraints to Work Within

- No tests in repo — verification is grep + manual trial.
- `ask_user_question` tool accepts ONE question per call; `❓ Question:` free-text supports same constraint.
- Edits must be self-consistent within `skills/explore/SKILL.md` (no external propagation per integration scan).
- Skill file edits use positive rules, no failure-mode warnings (memory: `feedback_prose_density.md`).

## Scope

### Building

- Rewrite of `skills/explore/SKILL.md`:
  - Replace Step 2 (lines 34-44) with candidate-generation step — `web-search-researcher` primary, orchestrator design-space enumeration, user-shortlist merge.
  - Insert Step 2.5 — candidate + dimension checkpoint with editable 6-dimension list and three-way option pattern.
  - Replace Step 3 (lines 46-57) with per-candidate × per-anchor-type fit dispatch.
  - Modify Step 4 (lines 58-62) — synthesis logic adds "no-fit" branch.
  - Modify Step 6 template Recommendation block (lines 167-195) — conditional no-fit shape.
  - Refresh Important Notes section (lines 242-262) — drop optional-web-search caveat; align with new flow.

### Not Building

- Closing the advertised `explore → design` seam (research Open Q2) — out of scope; separate design round.
- Any edit to `skills/design/SKILL.md`, `README.md`, `.rpiv/guidance/**/architecture.md`, `agents/*.md` — integration scan shows zero behavior coupling to the changes (description string, output dir, upstream/downstream contract all unchanged).
- New named agent files — research Architecture Insight 5 + memory rule (cascade risk; use existing `web-search-researcher` and `codebase-analyzer`).
- Persisted dimension-list config — keep dimension list inline in Step 2.5 prose; no `.rpiv/config.json` field.
- v2 features: per-slice question dispatch, named question-generator agent, `solutions_*` artifact schema migration to research-compatible headings.

## Decisions

### D1: Editable dimension list at Step 2.5 (developer ambiguity #1)

The 6 dimensions (approach-shape, precedent-fit, integration-risk, migration-cost, verification-cost, novelty) are presented as the default. Developer can drop dimensions during the checkpoint via the "Adjust dimensions" branch — kept set propagates through Step 3 dispatch and Step 6 Comparison grid columns.

**Why**: Greenfield/narrow topics make some dimensions irrelevant (e.g., migration-cost for a new service-layer choice). Reduces dispatch budget. Research Open Q1 intent.

### D2: Per-candidate × per-anchor-type fan-out (developer ambiguity #2)

Step 3 dispatches at most two agents per candidate: one `codebase-analyzer` covering all kept codebase-anchored dimensions for that candidate, and one `web-search-researcher` covering all kept external-anchored dimensions. Hybrid dimensions (approach-shape) are scored by the orchestrator from the two agents' returns. For 4 candidates: ≤8 agents. Either agent is skipped for a candidate if no dimension of that anchor-type was kept.

**Why**: Resolves the research's internal inconsistency between line 99 (per-dimension agents → 12+) and lines 174-176 (per-anchor-type → 8). Per-anchor-type lets one agent cross-correlate the candidate's dimensions in a single pass; per-dimension forced redundant per-candidate context loads. Developer decision.

### D3: "No-fit" branch in Step 4 recommendation (developer ambiguity #3)

Step 4 synthesis logic conditionally produces one of two Recommendation outputs:
- **Selected option** — when ≥1 candidate clears the fit filter on the kept dimensions: today's template (rationale, why-not, trade-offs, integration points).
- **No-fit** — when every candidate fails: lists each candidate's blocking dimension with evidence, recommends re-scoping the question or expanding the candidate pool, sets `confidence: low` and `status: blocked` in frontmatter.

The fit-filter threshold is qualitative — orchestrator judges per the per-candidate fit findings — not a numeric score. Step 6 template adds the conditional shape inline.

**Why**: Honest output when option-shopping returns no winner. Developer decision; matches research Open Q3 intent.

### D4: Step 2.5 sub-numbering (settled by research, recorded for completeness)

Use `## Step 2.5: Candidate Checkpoint`. Avoids renumbering Steps 3-8. Precedent: design-feature-iterative `7f7f25c` "replace Step 3 in-place"; integration scan confirms zero external file depends on explore's step numbering.

### D5: Three-way checkpoint pattern at Step 2.5

Options: "Proceed (Recommended)" (begin per-candidate fit dispatch); "Adjust candidates or dimensions" (rename/add/drop candidates or drop dimensions); "Re-generate candidates" (kill-switch — scrap candidates, re-run Step 2 with adjusted scope). Matches dominant pattern at `skills/plan/SKILL.md:64`, `skills/design/SKILL.md:176`, etc.; kill-switch borrows phrasing from `skills/outline-test-cases/SKILL.md:218`.

### D6: Web-search-researcher promoted to primary Step 2 agent

Drop "Optional: ... only if user requests" caveat at `skills/explore/SKILL.md:44`. `web-search-researcher` becomes a first-class Step 2 agent for ecosystem candidate-source. Orchestrator skips it only when the topic is wholly internal (e.g., "how to organize this service layer") and the user-shortlist + design-space enumeration cover the candidate space.

**Why**: Research Architecture Insight 4 — for library/framework selection, web is the primary candidate source.

### D7: In-place rewrite, no coexistence

No v1/v2 path, no compat shim. Replace lines 34-57 wholesale; replace lines 167-195 inside the template; replace Important Notes block. Memory rule `feedback_skill_redesign_no_coexistence.md`; precedent `920c276` consolidation.

## Architecture

### skills/explore/SKILL.md:34-44 — MODIFY (Slice 1: Step 2 — candidate generation)

```markdown
2. **Generate candidates and dimensions:**

   **Generate 2–4 named candidates** from three sources, then merge into one shortlist:

   - **Ecosystem scan** — spawn `web-search-researcher` for any topic where the candidate space includes external libraries, frameworks, or services. Prompt it to return 2–4 named options with one-line "what it is" + canonical doc link per option. Skip only when the topic is wholly internal (e.g., "how to organize this service layer") and the orchestrator's design-space enumeration plus the user shortlist already cover the space.
   - **Design-space enumeration** — orchestrator names abstract shapes from first principles when applicable (pub/sub vs direct-call vs event-bus; sync vs async; manual mapping vs auto-mapper). One-line "what it is" per shape.
   - **User shortlist** — if the user pre-named candidates in the entry prompt ("compare TanStack Query vs SWR"), include those verbatim.

   Merge to 2–4 candidates total. Name each with a short noun phrase ("TanStack Query", "Direct event bus"). Deduplicate.

   **Default dimension list** (presented at Step 2.5; developer may drop irrelevant ones):

   - **approach-shape** (hybrid) — what category of solution the candidate is, what core moving parts it requires.
   - **precedent-fit** (codebase-anchored) — does the existing code already use this pattern; how many call sites would adopt the new option.
   - **integration-risk** (codebase-anchored) — which existing seams the candidate would touch; what breaks if it lands.
   - **migration-cost** (external-anchored for libraries; codebase-anchored for in-house code) — work to introduce the candidate plus work to remove the incumbent if there is one.
   - **verification-cost** (codebase-anchored) — test/CI surface needed to make the candidate safe to adopt.
   - **novelty** (external-anchored) — how recently the candidate emerged, ecosystem momentum, deprecation risk.

   Hold the candidate set and default dimension list in working state for the Step 2.5 checkpoint. Do not dispatch fit agents yet.
```

### skills/explore/SKILL.md:45 — INSERT (Slice 2: Step 2.5 — candidate checkpoint)

```markdown
## Step 2.5: Candidate Checkpoint

Present the candidate set and default dimensions to the developer before per-candidate fit dispatch.

1. **Show candidates and dimensions:**

   ```
   ## Candidates for: [Topic]

   1. [Candidate A] — [one-line what it is]
   2. [Candidate B] — [one-line what it is]
   ...

   Dimensions (default 6; drop any that don't apply):
   - approach-shape · precedent-fit · integration-risk
   - migration-cost · verification-cost · novelty
   ```

2. **Confirm via the `ask_user_question` tool with the following question:** "[N] candidates, [D] dimensions. Begin per-candidate fit dispatch?". Header: "Candidates". Options: "Proceed (Recommended)" (Begin per-candidate fit dispatch with all [N] candidates and all [D] dimensions); "Adjust candidates or dimensions" (Rename, add, or drop candidates; drop dimensions that don't apply); "Re-generate candidates" (Candidates look wrong — re-run Step 2 with adjusted scope).

3. **Handle developer input:**

   **"Proceed"**: lock the candidate × dimension set; advance to Step 3.

   **"Adjust candidates or dimensions"**: ask the follow-up free-text question with prefix `❓ Question:` — "Which candidates and dimensions should be added, dropped, or renamed?" — apply edits to the working set, re-present, and confirm again with the same three-option `ask_user_question`.

   **"Re-generate candidates"**: ask the follow-up free-text question with prefix `❓ Question:` — "What should be different in candidate generation? (narrower/wider scope, different ecosystem, exclude approach X, …)" — return to Step 2 with the updated scope, then re-enter Step 2.5.

   Loop until "Proceed" is selected.
```

### skills/explore/SKILL.md:46-57 — MODIFY (Slice 3: Step 3 — per-candidate fit dispatch)

```markdown
3. **Per-candidate fit dispatch (parallel agents):**

   For each confirmed candidate, dispatch up to two agents in parallel — total ≤ 2 × N agents:

   - **One `codebase-analyzer` per candidate** — when ≥1 kept dimension is codebase-anchored (precedent-fit, integration-risk, often migration-cost and verification-cost). The agent scores the candidate on every kept codebase-anchored dimension in a single pass, returning evidence per dimension with `file:line` references.
   - **One `web-search-researcher` per candidate** — when ≥1 kept dimension is external-anchored (novelty, often migration-cost for libraries, approach-shape for ecosystem options). The agent scores the candidate on every kept external-anchored dimension in a single pass, returning evidence per dimension with doc/source links.

   Skip either agent for a candidate when no dimension of that anchor-type was kept. Hybrid dimension `approach-shape` is scored by the orchestrator after both agents return, by combining their per-candidate findings.

   **Per-candidate prompt shape** (use the same outer template, fill in candidate name and kept dimensions):

   ```
   Candidate: [name] — [one-line what it is]
   Topic: [topic from Step 1]

   Score this single candidate on the following dimensions, each with concrete evidence ([file:line] for codebase, doc/source link for external). Report findings as one section per dimension.

   Dimensions for this run:
   - [dimension name] — [one-line of what to look for]
   - ...

   Do NOT compare against other candidates; another agent handles each one separately. Focus on depth of evidence for THIS candidate.
   ```

   Wait for ALL agents to complete before proceeding.

   **Coverage check**: every (candidate × kept-dimension) cell is filled — by an agent's evidence or by an explicit `null` ("does not apply to this candidate"). Cells silently dropped indicate a missing dispatch — re-run that candidate's agent.
```

### skills/explore/SKILL.md:58-62 — MODIFY (Slice 4a: Step 4 — synthesize and recommend)

```markdown
4. **Synthesize and recommend:**

   - Cross-reference per-candidate findings — fill the candidate × dimension grid with evidence per cell.
   - Apply the fit filter qualitatively per candidate: a candidate "clears" when no kept dimension surfaces a blocking concern (integration-risk that breaks load-bearing seams, migration-cost that exceeds the topic's scope, verification-cost with no path to coverage).
   - **If ≥1 candidate clears the fit filter**: pick the strongest, document rationale with evidence, and explain why alternatives weren't chosen. Identify conditions that would change the recommendation.
   - **If every candidate fails the fit filter**: produce a "no-fit" recommendation — list each candidate's blocking dimension with evidence, recommend re-scoping the question or expanding the candidate pool, and set Step 6 frontmatter `confidence: low` and `status: blocked`.
```

### skills/explore/SKILL.md:167-195 — MODIFY (Slice 4b: Step 6 template Recommendation block — conditional no-fit shape)

```markdown
     ## Recommendation

     <!-- Render exactly ONE of the two blocks below, based on Step 4's fit-filter outcome. -->

     **(A) When ≥1 candidate clears the fit filter:**

     **Selected:** [Option N]

     **Rationale:**
     - [Key reason with evidence]
     - [Key reason with evidence]
     - ...

     **Why not alternatives:**
     - Option X: [Reason]

     **Trade-offs:**
     - Accepting [limitation] for [benefit]

     **Implementation approach:**
     1. [Phase 1] - [What to build]
     2. ...

     **Integration points:**
     - `file.ext:line` - [Specific change]
     - `file.ext:line` - [Specific change]

     **Patterns to follow:**
     - [Pattern]: `file.ext:line`

     **Risks:**
     - [Risk]: [Mitigation]

     **(B) When every candidate fails the fit filter:**

     **No-fit:** every candidate surfaced a blocking concern on at least one kept dimension.

     **Per-candidate blockers:**
     - [Option 1]: [blocking dimension] — [evidence with file:line or doc link]
     - [Option 2]: [blocking dimension] — [evidence]
     - ...

     **Recommended next step:**
     - [Re-scope the question] — [how the topic should narrow/widen so candidates can clear]
     - OR [Expand the candidate pool] — [what new candidate sources to enumerate; e.g., named ecosystem option not surfaced by Step 2]

     **Frontmatter overrides:** set `confidence: low` and `status: blocked`.
```

### skills/explore/SKILL.md:242-262 — MODIFY (Slice 4c: Important Notes — align with new flow)

```markdown
## Important notes:
- Always use parallel Agent tool calls to maximize efficiency and minimize context usage
- Always spawn fresh research to validate current state - never rely on old research docs as source of truth
- Old research documents can provide historical context but must be validated against current code
- Generate 2-4 named candidates in Step 2; confirm them with the developer at Step 2.5 before per-candidate fit dispatch
- Web-search-researcher is a first-class Step 2 agent for ecosystem candidate-source — skip only when the topic is wholly internal and design-space enumeration plus user shortlist cover the space
- Per-candidate fit dispatch caps at two agents per candidate (one codebase-analyzer, one web-search-researcher) — skip either when no dimension of its anchor-type was kept
- Solutions documents should be self-contained with all necessary context
- Each agent prompt should be specific and focused on a single candidate scored on the kept dimensions
- Quantify pattern precedent — count usage in codebase, don't just say "follows pattern"
- Ground complexity estimates in actual similar work from git history
- Think like a software architect — option-shopping output is 2–4 comparable candidates plus an honest fit verdict
- Keep the main agent focused on synthesis and comparison, not deep implementation details
- Encourage agents to find existing patterns and examples, not just describe possibilities
- Resolve technical unknowns during research — don't leave critical questions for design
- **File reading**: Always read mentioned files FULLY (no limit/offset) before invoking skills
- **Critical ordering**: Follow the numbered steps exactly
  - ALWAYS read mentioned files first before invoking skills (step 1)
  - ALWAYS generate candidates and run the Step 2.5 checkpoint before per-candidate dispatch (steps 2 → 2.5 → 3)
  - ALWAYS wait for all per-candidate agents to complete before synthesizing (step 3)
  - ALWAYS gather metadata before writing the document (step 5 before step 6)
  - NEVER write the solutions document with placeholder values
```

## Desired End State

```
$ /skill:explore Compare TanStack Query vs SWR for our data fetching layer

> [Step 1] Reading context...
> [Step 2] Generating candidates...
>   ecosystem scan (web-search-researcher) → TanStack Query, SWR, Apollo Client
>   user shortlist → TanStack Query, SWR
>   merged candidates: TanStack Query, SWR, Apollo Client (3)
> [Step 2.5]
>   ## Candidates for: data fetching layer
>   1. TanStack Query — server-state cache + fetcher hooks
>   2. SWR — Vercel's lightweight stale-while-revalidate hooks
>   3. Apollo Client — GraphQL-first cache + hooks
>
>   Dimensions (default 6; drop any that don't apply):
>   - approach-shape · precedent-fit · integration-risk
>   - migration-cost · verification-cost · novelty
>
>   ❓ ask_user_question: "3 candidates, 6 dimensions. Begin per-candidate fit dispatch?"
>     [Proceed (Recommended)] [Adjust candidates or dimensions] [Re-generate candidates]

> [user picks Adjust]
> ❓ Question: Which candidates and dimensions should be added, dropped, or renamed?
> [user]: Drop Apollo (we're not on GraphQL). Drop migration-cost (greenfield).
>
>   ## Candidates for: data fetching layer (updated)
>   1. TanStack Query — server-state cache + fetcher hooks
>   2. SWR — Vercel's lightweight stale-while-revalidate hooks
>
>   Dimensions: approach-shape · precedent-fit · integration-risk · verification-cost · novelty
>
>   ❓ ask_user_question: "2 candidates, 5 dimensions. Begin per-candidate fit dispatch?"
>     [Proceed (Recommended)] ...

> [user picks Proceed]
> [Step 3] Per-candidate fit dispatch (4 agents in parallel)
>   TanStack Query · codebase-analyzer (precedent-fit, integration-risk, verification-cost)
>   TanStack Query · web-search-researcher (approach-shape, novelty)
>   SWR · codebase-analyzer (precedent-fit, integration-risk, verification-cost)
>   SWR · web-search-researcher (approach-shape, novelty)
> [Step 4] Synthesizing... 1 candidate clears the fit filter (TanStack Query).
> [Step 5] Determining metadata...
> [Step 6] Writing thoughts/shared/solutions/2026-04-17_07-30-00_data-fetching-layer.md
> [Step 7] Recommendation: TanStack Query — strongest precedent-fit (3 existing query helpers
>          already follow the cache-key shape) and verification-cost is bounded (msw mocks
>          already in repo). SWR loses on precedent-fit (cache-key shape would force a wrapper
>          layer). Suggest: /skill:design thoughts/shared/solutions/2026-04-17_07-30-00_data-fetching-layer.md
```

## File Map

```
skills/explore/SKILL.md  # MODIFY — full restructure of Steps 2/2.5/3/4 + Step 6 Recommendation template + Important Notes
```

## Ordering Constraints

- Slice 1 (Step 2 candidate generation) lands before Slice 2 (Step 2.5 checkpoint) — checkpoint references the candidate set Slice 1 produces.
- Slice 2 lands before Slice 3 (Step 3 per-candidate fit dispatch) — dispatch references the confirmed candidate × dimension set Slice 2 locks.
- Slice 4 (Step 4 synthesis + Step 6 template + Important Notes) lands last — synthesis references the per-candidate evidence shape Slice 3 produces.
- All four slices touch the same file; merges must preserve final section ordering: Initial Setup → Step 1 → Step 2 → Step 2.5 → Step 3 → Step 4 → Step 5 → Step 6 → Step 7 → Step 8 → Important notes.

## Verification Notes

- `grep -n "^## Step\|^[0-9]\. " skills/explore/SKILL.md` — verify section ordering and step numbering matches Initial Setup → 1 → 2 → 2.5 → 3 → 4 → 5 → 6 → 7 → 8.
- `grep -n "Optional:.*web-search-researcher" skills/explore/SKILL.md` → 0 hits (caveat dropped).
- `grep -n "ask_user_question" skills/explore/SKILL.md` → ≥1 hit (Step 2.5 checkpoint).
- `grep -n "no-fit\|No-fit\|fit filter" skills/explore/SKILL.md` → ≥3 hits (Step 4 + Step 6 template + Important Notes).
- Manual trial: run `/skill:explore "compare TanStack Query vs SWR"` and confirm flow lands at Step 2.5 with three options before any Step 3 dispatch fires.
- Manual trial: at Step 2.5, pick "Adjust candidates or dimensions"; confirm follow-up `❓ Question:` is asked, edits apply, then `ask_user_question` re-presents.
- Manual trial: at Step 2.5, pick "Re-generate candidates"; confirm Step 2 re-runs with adjusted scope.
- Manual trial: contrive a no-fit case (e.g., `/skill:explore "PHP-only ORM for our TypeScript codebase"`); confirm Step 4 produces a no-fit recommendation, frontmatter sets `confidence: low` and `status: blocked`.
- Sanity: `grep -rn "skills/explore" README.md skills/design/SKILL.md .rpiv/guidance/skills/architecture.md skills/resume-handoff/SKILL.md` shows existing references unchanged (per integration scan: zero behavior coupling).

## Performance Considerations

- Per-candidate fan-out caps at ≤2 agents per candidate. For 4 candidates: ≤8 agents — vs today's 4–5 role agents. Modest increase, dwarfed by candidate-comparison value.
- Dropping dimensions at Step 2.5 reduces both prompt size and likelihood that either anchor-type agent dispatches at all (if all kept dims are codebase-anchored, web-search-researcher is skipped per candidate).
- `web-search-researcher` is the most expensive single agent (network + fetch); Step 2 gates one upfront ecosystem scan plus up to N per-candidate scans. Worst case for N=4: 5 web-search dispatches per `/skill:explore` invocation.
- No new file reads; no new persisted state; no `.rpiv/config.json` field added.

## Migration Notes

Not applicable — no persisted artifact schema change. Existing `thoughts/shared/solutions/*.md` documents stay valid. The Recommendation block of new artifacts may render the (B) no-fit shape; consumers (`design`, `resume-handoff`) read solutions opaquely per integration scan.

## Pattern References

- `skills/discover/SKILL.md:138-168` — checkpoint precedent: 2-option `ask_user_question` shape, "I want to adjust" follow-up.
- `skills/research/SKILL.md:104-143` — checkpoint precedent: grounded `❓ Question:` free-text + tool form with file:line evidence.
- `skills/outline-test-cases/SKILL.md:218,224` — kill-switch precedent: third-slot "Re-run discovery" / "Force re-scan" — model for "Re-generate candidates".
- `skills/plan/SKILL.md:64`, `skills/design/SKILL.md:176,206,288,322` — three-way "Proceed / Adjust / Change scope" pattern (verb-first labels, exactly one Recommended).
- `skills/explore/SKILL.md:135-198` — existing Solution Options / Comparison / Recommendation template (preserved; Recommendation gains conditional shape).
- `skills/explore/SKILL.md:161-165` — Comparison columns precedent (Codebase fit already encodes fit-as-dimension).
- `skills/research/SKILL.md:48-90` — grouped-dispatch pattern (informs per-candidate prompt shape).
- `agents/web-search-researcher.md:1-107` — output schema maps onto per-candidate external-dimension findings.
- `agents/codebase-analyzer.md:1-122` — output schema maps onto per-candidate codebase-fit findings.
- `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:131` — non-linearity invariant (output-defined; explore stays at `{base}/solutions/`).
- `thoughts/shared/research/2026-04-11_07-47-54_design-iterative-question-subagents.md:25` — replace-Step-3-in-place precedent (zero numbering shift, general-purpose subagents over named role agents).
- Commit `7f7f25c` — "Rewrite design-feature-iterative Step 3 as dimension sweep" — the closest analog: in-place rewrite, +11/-12 lines, no follow-up fixes.
- Commit `920c276` — "Consolidate skills catalog and bump to 0.3.0" — replacement-not-coexistence precedent (4 skills deleted outright).

## Developer Context

**Q1 (Step 2.5 dimension list editability — `thoughts/shared/research/2026-04-17_01-36-58_explore-discover-question-generation.md:171,219`):** fixed 6 vs editable at checkpoint?
A: **Editable at checkpoint.** Developer can drop irrelevant dimensions during the checkpoint; output Comparison grid columns reflect kept set. (Fixes downstream prompt shape for Slice 2; carried into Slice 3 dispatch and Slice 4 template.)

**Q2 (Step 3 fan-out shape — research lines 99 vs 174-176):** per-dimension agents (12+ for 4 candidates) vs per-anchor-type (≤8 for 4 candidates) vs per-dimension-across-candidates (6 max)?
A: **One agent per candidate per anchor-type.** Per candidate: one `codebase-analyzer` (kept codebase dims) + one `web-search-researcher` (kept external dims). ≤ 2N agents. Hybrid dimension `approach-shape` scored by orchestrator from both returns.

**Q3 (Step 4 outcome — `skills/explore/SKILL.md:167-195`):** add no-fit branch vs always recommend best-of-bad?
A: **Add no-fit branch.** When every candidate fails the fit filter, render the (B) shape: per-candidate blockers, recommended re-scope/expand step, frontmatter `confidence: low` + `status: blocked`.

**Q4 (Decomposition confirmation):** 4-slice decomposition (Step 2 / Step 2.5 / Step 3 / Step 4+6+Notes) approved?
A: **Approve.** Proceed to slice-by-slice generation.

## Design History

- Slice 1: Step 2 — candidate generation — approved as generated
- Slice 2: Step 2.5 — candidate checkpoint — approved as generated
- Slice 3: Step 3 — per-candidate fit dispatch — approved as generated
- Slice 4: Step 4 + Step 6 template + Important Notes — approved as generated

## References

- Research: `thoughts/shared/research/2026-04-17_01-36-58_explore-discover-question-generation.md`
- Questions source: `thoughts/shared/questions/2026-04-17_00-30-26_explore-discover-question-generation.md` (linked from research)
- Dimension-subagent precedent: `thoughts/shared/research/2026-04-11_07-47-54_design-iterative-question-subagents.md`
- Non-linearity invariant: `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:131`
- Skill body conventions: `.rpiv/guidance/skills/architecture.md`
- Agent capability tiers: `.rpiv/guidance/agents/architecture.md`
