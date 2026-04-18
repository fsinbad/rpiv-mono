---
date: 2026-04-17T07:39:06-0400
planner: Claude Code
git_commit: d271bdd
branch: main
repository: rpiv-pi
topic: "Restructure skills/explore/SKILL.md into option-shopping flow with candidate checkpoint and per-candidate fit dispatch"
tags: [plan, explore, option-shopping, candidate-generation, dimension-checkpoint, fit-dispatch, skill-rewrite]
status: ready
design_source: "thoughts/shared/designs/2026-04-17_07-19-49_explore-option-shopping-restructure.md"
last_updated: 2026-04-17
last_updated_by: Claude Code
---

# Explore — Option-Shopping Flow Implementation Plan

## Overview

Rewrite `skills/explore/SKILL.md` in place so Step 2 generates 2–4 named candidates (web-search-researcher promoted to primary; orchestrator enumerates design-space; merges user shortlist), Step 2.5 lets the developer confirm candidates and drop irrelevant dimensions, Step 3 fans out one codebase-analyzer + one web-search-researcher per candidate to score kept dimensions, and Step 4 gains a "no-fit" branch rendered via a conditional Step 6 template. Output path, frontmatter, and downstream contract with `design` are unchanged.

See design: `thoughts/shared/designs/2026-04-17_07-19-49_explore-option-shopping-restructure.md`.

## Desired End State

`/skill:explore "Compare TanStack Query vs SWR"` runs: Step 2 generates candidates (ecosystem scan + design-space + user shortlist merged), Step 2.5 presents them via `ask_user_question` with three options (Proceed / Adjust / Re-generate), Step 3 dispatches ≤2 agents per confirmed candidate on kept dimensions, Step 4 produces either a "selected option" or a "no-fit" recommendation, and Step 6 writes `thoughts/shared/solutions/*.md` with the matching Recommendation shape. Verify with the grep commands and manual trials listed in Testing Strategy.

## What We're NOT Doing

- Closing the advertised `explore → design` seam (research Open Q2) — separate design round.
- Editing `skills/design/SKILL.md`, `README.md`, `.rpiv/guidance/**/architecture.md`, `agents/*.md` — integration scan shows zero behavior coupling.
- Adding new named agent files — existing `web-search-researcher` and `codebase-analyzer` cover the dispatch.
- Persisted dimension-list config — dimension list stays inline in Step 2.5 prose; no `.rpiv/config.json` field.
- v2 features: per-slice question dispatch, named question-generator agent, `solutions_*` artifact schema migration.
- v1 coexistence or compat shim — in-place rewrite per memory rule `feedback_skill_redesign_no_coexistence.md`.

## Phase 1: Restructure explore SKILL.md into option-shopping flow

### Overview

Apply all four slices in sequence to `skills/explore/SKILL.md`: replace Step 2 with candidate generation, insert Step 2.5 checkpoint, replace Step 3 with per-candidate fit dispatch, and replace the Step 4 synthesis + Step 6 Recommendation template + Important Notes block. One worktree session, one commit; the file stays self-consistent at every intermediate state.

### Changes Required:

#### 1. Step 2 — candidate generation (Slice 1)
**File**: `skills/explore/SKILL.md`
**Changes**: Replace current lines 34-44 (Step 2 five-role-agent dispatch) with candidate-generation step that enumerates 2–4 named candidates from three sources (ecosystem scan, design-space enumeration, user shortlist) and holds the default 6-dimension list in working state.

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

#### 2. Step 2.5 — candidate checkpoint (Slice 2)
**File**: `skills/explore/SKILL.md`
**Changes**: Insert a new `## Step 2.5: Candidate Checkpoint` section after Step 2 and before Step 3. Presents candidate/dimension set, asks three-way `ask_user_question` (Proceed / Adjust / Re-generate), handles each branch with a grounded `❓ Question:` follow-up where applicable, loops until Proceed.

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

#### 3. Step 3 — per-candidate fit dispatch (Slice 3)
**File**: `skills/explore/SKILL.md`
**Changes**: Replace current lines 46-57 (post-dispatch "enumerate 2-4 viable approaches") with per-candidate × per-anchor-type fit dispatch. ≤2 agents per candidate (one codebase-analyzer for kept codebase-anchored dims, one web-search-researcher for kept external-anchored dims). Orchestrator scores hybrid `approach-shape`. Includes explicit sync barrier and coverage check.

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

#### 4. Step 4 — synthesize and recommend with no-fit branch (Slice 4a)
**File**: `skills/explore/SKILL.md`
**Changes**: Replace current lines 58-62 (Step 4 synthesis) with qualitative fit-filter application and a branching recommendation: "selected option" when ≥1 candidate clears, "no-fit" when every candidate fails (sets `confidence: low`, `status: blocked` in frontmatter).

```markdown
4. **Synthesize and recommend:**

   - Cross-reference per-candidate findings — fill the candidate × dimension grid with evidence per cell.
   - Apply the fit filter qualitatively per candidate: a candidate "clears" when no kept dimension surfaces a blocking concern (integration-risk that breaks load-bearing seams, migration-cost that exceeds the topic's scope, verification-cost with no path to coverage).
   - **If ≥1 candidate clears the fit filter**: pick the strongest, document rationale with evidence, and explain why alternatives weren't chosen. Identify conditions that would change the recommendation.
   - **If every candidate fails the fit filter**: produce a "no-fit" recommendation — list each candidate's blocking dimension with evidence, recommend re-scoping the question or expanding the candidate pool, and set Step 6 frontmatter `confidence: low` and `status: blocked`.
```

#### 5. Step 6 Recommendation template — conditional no-fit shape (Slice 4b)
**File**: `skills/explore/SKILL.md`
**Changes**: Replace the Recommendation block inside the Step 6 template (current lines 167-195) with a conditional two-shape block: (A) selected option (today's template preserved) and (B) no-fit (per-candidate blockers, recommended re-scope/expand, frontmatter overrides).

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

#### 6. Important Notes — align with new flow (Slice 4c)
**File**: `skills/explore/SKILL.md`
**Changes**: Replace the Important Notes block (current lines 242-262) to drop the optional-web-search caveat, document the candidate-generation + Step 2.5 checkpoint + fit-dispatch cap, and tighten the critical-ordering list to reflect the new step sequence.

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

### Success Criteria:

#### Automated Verification:
- [x] Section ordering and step numbering correct: `grep -n "^## Step\|^[0-9]\. " skills/explore/SKILL.md` shows Initial Setup → 1 → 2 → 2.5 → 3 → 4 → 5 → 6 → 7 → 8
- [x] Optional-web-search caveat dropped: `grep -n "Optional:.*web-search-researcher" skills/explore/SKILL.md` returns 0 matches
- [x] Checkpoint tool wired in: `grep -n "ask_user_question" skills/explore/SKILL.md` returns ≥1 match (Step 2.5)
- [x] No-fit branch present in three locations: `grep -n "no-fit\|No-fit\|fit filter" skills/explore/SKILL.md` returns ≥3 matches (Step 4 + Step 6 template + Important Notes)
- [x] External references unchanged (no behavior coupling): `grep -rn "skills/explore" README.md skills/design/SKILL.md .rpiv/guidance/skills/architecture.md skills/resume-handoff/SKILL.md` returns the same lines as before the rewrite

#### Manual Verification:
- [ ] Run `/skill:explore "compare TanStack Query vs SWR"` — flow lands at Step 2.5 with three options (Proceed / Adjust / Re-generate) before any Step 3 dispatch fires
- [ ] At Step 2.5, pick "Adjust candidates or dimensions" — follow-up `❓ Question:` is asked, edits apply to the working set, then `ask_user_question` re-presents with the updated candidate × dimension set
- [ ] At Step 2.5, pick "Re-generate candidates" — follow-up `❓ Question:` is asked, Step 2 re-runs with adjusted scope, Step 2.5 re-enters
- [ ] Contrive a no-fit case (e.g., `/skill:explore "PHP-only ORM for our TypeScript codebase"`) — Step 4 produces a no-fit recommendation, Step 6 frontmatter sets `confidence: low` and `status: blocked`, solutions doc renders the (B) block
- [ ] Happy-path recommendation still renders correctly — Step 6 (A) block unchanged from today's template when ≥1 candidate clears

---

## Testing Strategy

### Automated:
- `grep -n "^## Step\|^[0-9]\. " skills/explore/SKILL.md` — verify step numbering sequence
- `grep -n "Optional:.*web-search-researcher" skills/explore/SKILL.md` — caveat removal
- `grep -n "ask_user_question" skills/explore/SKILL.md` — checkpoint presence
- `grep -n "no-fit\|No-fit\|fit filter" skills/explore/SKILL.md` — branch coverage
- `grep -rn "skills/explore" README.md skills/design/SKILL.md .rpiv/guidance/skills/architecture.md skills/resume-handoff/SKILL.md` — external references unchanged

### Manual Testing Steps:
1. Run `/skill:explore "compare TanStack Query vs SWR"` in a pi session; confirm candidates are generated and Step 2.5 presents three options before dispatch.
2. From Step 2.5, select "Adjust candidates or dimensions"; provide free-text edits (e.g., drop one candidate, drop one dimension); confirm the edits apply and the checkpoint re-presents.
3. From Step 2.5, select "Re-generate candidates"; provide adjusted scope; confirm Step 2 re-runs and Step 2.5 re-enters.
4. From Step 2.5, select "Proceed"; confirm ≤2 agents per candidate dispatch in parallel; confirm sync barrier (no Step 4 work starts before all agents return).
5. Trigger a no-fit case; confirm Step 4 renders the (B) block, frontmatter has `confidence: low` + `status: blocked`, solutions artifact written to `thoughts/shared/solutions/`.
6. Compare written solutions artifact against prior-artifact shape — frontmatter fields and output path unchanged.

## Performance Considerations

- Per-candidate fan-out caps at ≤2 agents per candidate. For 4 candidates: ≤8 agents — vs today's 4–5 role agents. Modest increase, dwarfed by candidate-comparison value.
- Dropping dimensions at Step 2.5 reduces both prompt size and likelihood that either anchor-type agent dispatches at all (if all kept dims are codebase-anchored, web-search-researcher is skipped per candidate).
- `web-search-researcher` is the most expensive single agent (network + fetch); Step 2 gates one upfront ecosystem scan plus up to N per-candidate scans. Worst case for N=4: 5 web-search dispatches per `/skill:explore` invocation.
- No new file reads; no new persisted state; no `.rpiv/config.json` field added.

## Migration Notes

Not applicable — no persisted artifact schema change. Existing `thoughts/shared/solutions/*.md` documents stay valid. The Recommendation block of new artifacts may render the (B) no-fit shape; consumers (`design`, `resume-handoff`) read solutions opaquely per integration scan.

## References

- Design: `thoughts/shared/designs/2026-04-17_07-19-49_explore-option-shopping-restructure.md`
- Research: `thoughts/shared/research/2026-04-17_01-36-58_explore-discover-question-generation.md`
- Questions source: `thoughts/shared/questions/2026-04-17_00-30-26_explore-discover-question-generation.md`
- Dimension-subagent precedent: `thoughts/shared/research/2026-04-11_07-47-54_design-iterative-question-subagents.md`
- Non-linearity invariant: `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:131`
- Skill body conventions: `.rpiv/guidance/skills/architecture.md`
- Agent capability tiers: `.rpiv/guidance/agents/architecture.md`
