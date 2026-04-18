---
date: 2026-04-17T01:36:58-0400
researcher: Claude Code
git_commit: d271bdd
branch: main
repository: rpiv-pi
topic: "Incorporate discover-style question generation into the explore skill — chained vs built-in"
tags: [research, codebase, explore, discover, question-generation, option-shopping, candidate-generation, design-seam]
status: complete
questions_source: "thoughts/shared/questions/2026-04-17_00-30-26_explore-discover-question-generation.md"
last_updated: 2026-04-17
last_updated_by: Claude Code
---

# Research: Incorporate discover-style question generation into the explore skill

## Research Question

Can `explore` incorporate a discover-like approach — either by **chaining** (consuming a questions artifact produced by `/skill:discover`) or by **building in** discover's question-generation/dispatch logic inline?

## Summary

Explore is fundamentally **option-shopping**, not trace-depth: the developer clarified the use case is "which UI library?", "which test framework?", "how to broadcast state?", "how to organize a service layer?". Candidates come from **external ecosystem (web)** and **design-space enumeration**, not from codebase pattern discovery. The codebase pass is a **fit filter** scoring how well each candidate integrates with existing code — not a candidate source.

This reframes the original chained-vs-built-in question. Neither matches explore's shape directly:

- **Discover's rubric** at `skills/discover/SKILL.md:120-124` ("trace a complete code path, name EVERY intermediate file") is single-architecture depth. It cannot express "compare TanStack Query vs SWR" because some candidates have no local `file:line` anchor.
- **A naive built-in "6 dimension subagents" port** from `thoughts/shared/research/2026-04-11_07-47-54_design-iterative-question-subagents.md:22-25` produces a filled N-candidate × 6-dimension grid but stumbles on **candidate-source**: today's Step 3 at `skills/explore/SKILL.md:46-56` folds candidate-generation + dispatch-synthesis into an implicit post-dispatch enumeration, which means dimension agents would fire before candidates exist.

The agreed resolution is a **Step 2.5 candidate checkpoint** structure:

1. **Step 2** (new): Generate candidates — dispatch `web-search-researcher` as a primary (not optional) agent for ecosystem scan, orchestrator enumerates design-space shapes, merge user-supplied shortlist. Emit 2–4 named candidates.
2. **Step 2.5** (new): Candidate checkpoint — present names + dimensions, let developer confirm/edit before expensive per-candidate dispatch runs.
3. **Step 3** (restructured): Per-candidate fit dispatch — one `codebase-analyzer` per candidate × codebase-anchored dimension (precedent-fit, integration-risk), plus one `web-search-researcher` per candidate × external-anchored dimension (ecosystem tradeoffs). The **dimensions are the questions** — no separate question-generation step.
4. **Step 4**: Fill comparison grid + recommendation (template unchanged at `skills/explore/SKILL.md:135-198`).
5. **Step 5**: Write solutions artifact (unchanged output path `{base}/solutions/`).

The non-linearity invariant is preserved because it's **OUTPUT-defined** (`{base}/solutions/` directory + no `_meta.md` write), not INPUT-defined — confirmed at `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:131`. Explore can accept artifact-typed input without relocating output.

The advertised-but-unimplemented `explore → design` seam (`skills/design/SKILL.md:3` vs `:33`, `:394`) is **not** automatically closed by this structure. See Open Questions.

## Detailed Findings

### Current explore dispatch (`skills/explore/SKILL.md:34-57`)

Today's Step 2 is five bullet lines at `skills/explore/SKILL.md:39-44` spawning role-based agents (`codebase-locator`, `codebase-analyzer`, `codebase-pattern-finder`, `thoughts-locator`, optional `web-search-researcher`) against the raw user topic with:

- **No pre-decomposition** between Step 1 context-read (`:27-32`) and Step 2 spawn (`:39`).
- **Role-cardinality implicitly 1-per-role** (`:40-43`, singular "Use the ... agent").
- **Raw topic per prompt** — no slicing, no anchor terms, no split-on-"and".
- **Step 3 at `:46-57`** then enumerates "2-4 viable approaches" post-dispatch. Candidate-generation is implicit and unstructured.

### Discover's decomposition primitives (`skills/discover/SKILL.md:33-136`)

Discover has two distinct primitives at different pipeline stages:

**Slice** (`skills/discover/SKILL.md:36-37`) — pre-discovery dispatch input:
> "one capability or seam, exactly one search objective, and 2-6 likely anchor terms"

Hypothesized anchors. Coverage uncheck. Drives locator/integration-scanner fan-out.

**Question** (`skills/discover/SKILL.md:120-124`) — post-discovery synthesized output:
> "3-6 sentence paragraph / Traces a complete code path / Names EVERY intermediate file, function, and type"

Confirmed anchors (files read at Step 3, `:95-112`). Coverage-checked at `:136` ("every key file read in Step 3 should appear in at least one question").

**Both rubrics are wrong-shaped for explore.** Slices assume a single subsystem has seams to explore; questions assume a single architecture to trace. Option-shopping has neither — it has a candidate space × dimension matrix.

### Option-comparison rubric (new, not in discover)

The rubric explore needs is horizontal, not vertical:

| Rubric | Coverage axis | Question shape | Anchor pattern |
|---|---|---|---|
| Discover (trace-quality) `skills/discover/SKILL.md:114-136` | File-space (every discovered file hit) | Vertical code-path trace | Serial file:line anchors along one path |
| **Explore (option-comparison)** | Candidate-space × dimension-space (every cell filled) | Horizontal candidate scoring per dimension | Parallel anchors: file:line for codebase dims, web links for external dims, explicit `null` for novelty |

Each question is "for each of candidates A/B/C, score on dimension D with evidence per candidate." Coverage check: candidate × dimension matrix is fully populated OR explicitly marked `null` for candidates where the dimension doesn't apply.

### Candidate-source modes (developer clarification)

The developer specified candidates come primarily from:

1. **External ecosystem (web)** — UI libraries, test frameworks, ORMs. `web-search-researcher` at `skills/explore/SKILL.md:44` must be upgraded from "optional" to primary dispatch agent in Step 2.
2. **Design-space enumeration** — abstract shapes orchestrator names from first principles (pub/sub vs direct-call vs event-bus; sync vs async). No precedent search required.
3. **User-supplied shortlist** — user pre-names candidates in the entry prompt ("compare TanStack Query vs SWR").

Explicitly **not** a primary source:

- **Codebase precedent** is a **fit filter**, not a candidate source. Every candidate gets scored for how well it fits existing code. Already modeled at `skills/explore/SKILL.md:164` ("Codebase fit" as a Comparison column).

### Proposed pipeline restructure

| Step | Purpose | Dispatch |
|---|---|---|
| 1 | Read context (unchanged, `skills/explore/SKILL.md:27-32`) | — |
| **2** | Generate candidates | `web-search-researcher` (primary); orchestrator enumerates design-space; merge user shortlist |
| **2.5** | Candidate checkpoint | Present 2–4 named candidates + dimension list; developer confirms/edits before expensive dispatch |
| **3** | Per-candidate fit dispatch | Per candidate × codebase-anchored dimension → `codebase-analyzer`; per candidate × external dimension → `web-search-researcher` |
| 4 | Fill comparison grid + recommendation (template unchanged, `skills/explore/SKILL.md:135-198`) | — |
| 5 | Write solutions artifact (output path unchanged) | — |

**Dimensions serve as the questions.** No separate question-generation step. The 6 candidate dimensions each become a structured dispatch prompt: "for candidate X, answer this dimension with evidence." Examples (see Architecture Insights below).

### Non-linearity invariant (`thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:131`)

The invariant is **output-defined**:

1. Writes to `{base}/solutions/` (flat project-level directory).
2. Never touches feature `_meta.md`.
3. No `current_*` pointer to advance (there is no `current_solution` field per `:252-255`).

Line 131 explicitly permits feature-path input: "When `explore` is invoked with a feature-folder artifact path as its argument, it adds `source_feature: {slug}` to the solutions artifact's frontmatter ... but still writes to `{base}/solutions/` and never touches any feature `_meta.md`."

**Consequence**: the Step 2/2.5/3 restructure does not threaten the invariant. Neither does consuming a chained questions artifact if that turns out to be useful later.

### The advertised `explore → design` seam

`skills/design/SKILL.md:3` frontmatter:
> "Always requires a research artifact from discover → research, or a solutions artifact from explore."

But `skills/design/SKILL.md:33` only extracts research-specific sections (`Summary, Code References, Integration Points, Architecture Insights, Developer Context, Open Questions`), and `:394` invariant says "research artifact produced by the research skill. There is no standalone design mode."

The proposed structure does **not** close this seam automatically. The per-candidate fit dispatch in Step 3 produces `file:line`-grounded evidence that *could* be aggregated into `Integration Points` and `Architecture Insights` headings, but the comparison grid + recommendation are additive sections design doesn't parse.

Two paths to close the seam (future work; not in this research scope):

- **A**: extend design Step 1 (`skills/design/SKILL.md:29-46`) to parse solutions-format artifacts — detect `## Solution Options` + `## Recommendation`, inherit the recommended option as a fixed decision at `:151-153`, synthesize `Integration Points` from the per-candidate fit section.
- **B**: migrate solutions artifact to include research-compatible headings (`## Code References`, `## Architecture Insights`) populated from Step 3's per-candidate fit dispatch, in addition to the option-comparison sections.

## Code References

- `skills/explore/SKILL.md:34-44` — current Step 2 role-based dispatch (5 bullets, no slicing)
- `skills/explore/SKILL.md:46-57` — current Step 3, folds candidate-generation + synthesis implicitly
- `skills/explore/SKILL.md:122-133` — Current State template (sourced from code analysis, benefits most from restructure)
- `skills/explore/SKILL.md:135-198` — Solution Options + Comparison + Recommendation template (unchanged in proposal)
- `skills/explore/SKILL.md:164` — "Codebase fit" column (already encodes fit-as-dimension)
- `skills/explore/SKILL.md:248-249` — existing guidance on prompt specificity + pattern quantification (compatible with dimension-anchored dispatch)
- `skills/discover/SKILL.md:33-94` — slice-decomposition framework (reference; wrong-shaped for explore's option-shopping)
- `skills/discover/SKILL.md:114-136` — trace-quality question rubric (reference; wrong-shaped for option-comparison)
- `skills/discover/SKILL.md:138-168` — developer checkpoint precedent (Step 2.5 matches this rhythm)
- `skills/research/SKILL.md:48-90` — grouped-dispatch + precedent sweep pattern (reference for per-candidate dispatch prompt shape)
- `skills/research/SKILL.md:104-143` — developer checkpoint precedent (Step 2.5 matches this rhythm)
- `skills/design/SKILL.md:3` vs `:33`,`:394` — advertised-but-unimplemented seam (flagged; out of scope)
- `agents/codebase-analyzer.md:5,8,54-101` — analyzer output format maps 1:1 onto per-candidate fit findings
- `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:131` — non-linearity invariant is output-defined; feature-path input allowed
- `thoughts/shared/research/2026-04-11_07-47-54_design-iterative-question-subagents.md:22-25,70,179,270` — dimension-subagent precedent + "1 fan-out not N" rule

## Integration Points

### Inbound References

- No external callers — `explore` is a user-invocable skill. Entry points: `/skill:explore [feature/change description]` (free-text today) or potentially `/skill:explore thoughts/shared/questions/...md` (future chained variant, out of scope).

### Outbound Dependencies

- `agents/web-search-researcher.md` — upgraded from optional to primary Step 2 agent.
- `agents/codebase-analyzer.md` — used per-candidate in Step 3 fit dispatch.
- `agents/codebase-pattern-finder.md` — retained for dimension-scoped precedent counting (precedent-fit dimension).
- `agents/thoughts-locator.md` — optional, for prior explore artifacts covering similar candidate spaces.
- No new agent files needed. All work is in `skills/explore/SKILL.md`.

### Infrastructure Wiring

- No extension/hook changes required. The restructure is purely internal to `skills/explore/SKILL.md`.
- Output path `{base}/solutions/` is unchanged; no `_meta.md` contact.
- Frontmatter fields unchanged (`source_feature`, `questions_source`, `research_source` still optional per `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:422`).

## Architecture Insights

1. **Dimensions are the questions.** In option-comparison, the dispatch axis and the question set collapse into one primitive. Each dimension subagent answers "for each candidate, how does it score on this dimension, with evidence per candidate." No separate question-generation step is needed because the dimensions are fixed (approach-shape, precedent-fit, integration-risk, migration-cost, verification-cost, novelty) and the rubric per dimension is uniform.

2. **Candidate-source determines agent type per dimension.**
   - Codebase-anchored dimensions (precedent-fit, integration-risk) → `codebase-analyzer` per candidate.
   - External-anchored dimensions (ecosystem tradeoffs, migration-cost for libraries) → `web-search-researcher` per candidate.
   - Hybrid dimensions (approach-shape) → orchestrator synthesis + 1–2 anchors per candidate.

3. **Checkpoint shields expensive dispatch.** Per-candidate × per-dimension fan-out is N × D agents (e.g., 4 candidates × 3 codebase dimensions = 12 agents). A cheap 2-line checkpoint before fan-out protects against scoring hallucinated/wrong candidates. Matches existing checkpoint rhythm in `discover` (`skills/discover/SKILL.md:138-168`) and `research` (`skills/research/SKILL.md:104-143`).

4. **Web-search is not optional for explore.** `skills/explore/SKILL.md:44` currently flags it as "Optional: ... only if user requests". For library/framework selection, it is the primary candidate source. The restructure promotes it to a first-class Step 2 agent.

5. **Non-linearity invariant is output-defined, not input-defined.** Confirmed at `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:131`. Any future addition (chained entry mode, feature-path input) is permitted as long as output remains `{base}/solutions/` with no `_meta.md` write.

## Precedents & Lessons

Precedent sweep was dropped at developer direction (rpiv-skillbased reference repo explicitly out of scope for rpiv-pi design decisions). The two in-scope precedent documents were read directly:

- **`thoughts/shared/research/2026-04-11_07-47-54_design-iterative-question-subagents.md:22-25, 70, 179, 270`** — dimension-subagent precedent for `design`. Key lessons carried forward: (a) replace in-place to avoid numbering shift, (b) prefer 1 fan-out, not N (avoid multiplied dispatch); (c) dimensions work when three contracts triangulate on the same axis — here: dispatch axis + rubric questions + Comparison table columns at `skills/explore/SKILL.md:161-165`.
- **`thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md:131, 739`** — explore's non-linearity was deliberately reaffirmed on 2026-04-16 after dropping mode-branching and `_meta.md` seeding ("mode branching added complexity without benefit"). Lesson: keep explore's input/output contract simple; do not introduce input-type branches that affect where the output lives.

## Historical Context (from thoughts/)

- `thoughts/shared/questions/2026-04-17_00-30-26_explore-discover-question-generation.md` — upstream questions artifact driving this research
- `thoughts/shared/research/2026-04-11_07-47-54_design-iterative-question-subagents.md` — dimension-subagent precedent applied to `design`
- `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md` — explore's non-linearity decision and slug-propagation mechanics

## Developer Context

**Q: Which of chained/built-in/hybrid is the primary goal?**
A: Neither as originally framed. Explore is **option-shopping** (UI libraries, test frameworks, broadcast patterns, service-layer organization) — the output is inherently 2–4 comparable candidates. Discover's trace-quality rubric at `skills/discover/SKILL.md:120-124` is wrong-shaped because some candidates (external libraries) have no local `file:line` anchor.

**Q: Where do candidates come from?**
A: External ecosystem (web), design-space enumeration, user-supplied shortlist. Codebase precedent is **not** a candidate source — it's a fit filter. Every suggested option must be evaluated for fit (better or worse) against existing code.

**Q: Where should candidate-generation land in the flow?**
A: Step 2 (explicit generation) + Step 2.5 (checkpoint before expensive per-candidate dispatch). Rationale accepted: asymmetric hallucination cost; checkpoint precedent already exists in discover/research; matches skill's "user picks" spirit.

**Q: Proceed with this structure as the research finding?**
A: Yes.

## Related Research

- Questions source: `thoughts/shared/questions/2026-04-17_00-30-26_explore-discover-question-generation.md`
- Dimension-subagent precedent: `thoughts/shared/research/2026-04-11_07-47-54_design-iterative-question-subagents.md`
- Non-linearity decision: `thoughts/shared/designs/2026-04-15_23-52-12_artifact-organization-strategy.md`

## Open Questions

1. **Fixed vs user-editable dimension list at Step 2.5 checkpoint.** Proposal shows 6 dimensions (approach-shape, precedent-fit, integration-risk, migration-cost, verification-cost, novelty). Design question not resolved: should the checkpoint let the developer drop dimensions that don't matter for a specific topic (e.g., "migration-cost" is irrelevant for a greenfield service-layer choice), or is the dimension list fixed for consistency across solutions artifacts?

2. **Closing the advertised `explore → design` seam.** The restructure does not close the seam at `skills/design/SKILL.md:3` vs `:33`,`:394` automatically. Two paths (extend design Step 1 to parse solutions-format, OR migrate solutions artifact to include research-compatible headings) are noted but out of scope for this research. Resolution should happen in a separate design round.

3. **Handling "no good candidate" outcomes.** Today's Step 3 at `skills/explore/SKILL.md:46-56` implicitly assumes 2–4 viable approaches exist. Under per-candidate fit dispatch, it's possible every candidate fails the fit filter. Should Step 4's recommendation template at `:167-195` gain a "no recommendation; all candidates unfit" branch, or does the orchestrator force a recommendation among bad options?

4. **Per-candidate dispatch budget.** With 4 candidates × 3 codebase dimensions = 12 `codebase-analyzer` spawns plus 4 `web-search-researcher` spawns, Step 3 dispatch is significantly heavier than today's 4–5 role-agent spawn. Is this budget acceptable, or should the checkpoint also let the developer cap dimensions-per-candidate to keep fan-out under some threshold (e.g., ≤8 total agents)?
