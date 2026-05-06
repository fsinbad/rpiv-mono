---
name: discover
description: Interview the developer one question at a time to extract feature intent and requirements, walking the decision tree branch by branch with a recommended answer at every step, then synthesize into a Feature Requirements Document at thoughts/shared/discover/. Use as the canonical entry point of the pipeline before research, or to stress-test a feature idea before any codebase discovery. When a question can be answered from the codebase (light grep + 1-2 narrow agent dispatches), look it up instead of asking. The FRD's Decisions block is consumed by `research` and propagates through Developer Context into `design`.
argument-hint: [free-text feature description | existing artifact path]
---

# Discover

You are tasked with extracting feature intent and requirements through a relentless one-question-at-a-time interview, then writing a Feature Requirements Document (FRD) that downstream skills consume. Walk the decision tree branch by branch, resolving each parent before its children. When a question is answerable from the codebase, answer it from the codebase — do not ask the developer.

**How it works**:
- Read input (free-text or artifact path) (Step 1)
- Lightweight codebase probe with light fan-out (Step 2)
- Build the decision tree internally (Step 3)
- Interview loop — one question at a time with a recommended answer (Step 4)
- Synthesize answers into FRD sections (Step 5)
- Write the artifact (Step 6)
- Present and chain to research (Step 7)

The final artifact is research-compatible — its Decisions block is translated into research's Developer Context and inherited by design.

## Step 1: Input Handling

Input: `$ARGUMENTS`

1. **No argument provided**:
   ```
   I'll capture feature intent into an FRD. Provide one of:

   `/skill:discover [free-text feature description]`     — fresh interview, write a new FRD
   `/skill:discover [existing artifact path]`            — refine an existing FRD/ticket/doc via fresh interview
   ```
   Then wait for input.

2. **Detect input shape** — parse `$ARGUMENTS`:
   - If the argument is an existing file path (resolves to a readable `.md` under `thoughts/`, or any path the user mentions for refinement context), read it FULLY using the Read tool WITHOUT limit/offset. Treat its content as baseline context — the interview surfaces gaps, missing requirements, and unstated assumptions relative to what's already documented.
   - Otherwise → fresh-feature mode: the entire argument is the free-text feature description.

3. **Read any other files mentioned** in the prompt (tickets, docs, related artifacts) FULLY before proceeding.

Each invocation always writes a NEW timestamp-distinct artifact (Step 6) — there is no in-place stress-test append mode. To iterate on a prior FRD, either re-invoke discover (produces a fresh artifact) or manually Edit the prior artifact.

## Step 2: Lightweight Codebase Probe (light agent fan-out permitted)

Goal: identify which questions the codebase can answer so you don't ask the developer about them.

1. Extract anchor terms from the input — feature names, component names, file paths, command names, config keys mentioned by the user.
2. Run focused `grep` / `find` / `ls` for those anchors. Cap at 5-8 sweeps. This is NOT a discovery sweep — that's `research`'s job downstream. Goal here is just enough grounding to recognize which branches of the decision tree have evidence-based answers.
3. If 1-2 specific seams genuinely need depth beyond grep, spawn at most 2 agents in parallel using the Agent tool:
   - **codebase-locator** — "Find ALL files implementing/calling/configuring [specific component]; report function names, class/type names, and import paths."
   - **codebase-analyzer** (only when one seam needs end-to-end tracing) — "Trace how [specific integration point] works in detail. Cite `file:line` for each step."
   Do NOT dispatch breadth-discovery agents (`scope-tracer`, broad locator sweeps, integration-scanner) — those duplicate research's job. The boundary: probe, not discovery.
4. Read any clearly-relevant files surfaced by the sweep or agents (≤5 files in main context, files <300 lines fully, larger files first 150 lines).
5. Build a short internal map: `{ branch → evidence }` for every branch you can pre-answer. These become evidence-based Decisions in Step 5, NOT interview questions in Step 4.

Wait for ALL agents to complete before proceeding to Step 3.

## Step 3: Build the Decision Tree

Synthesize the questions internally before asking anything. A good tree has:
- **Root** — what is the developer actually trying to do? (problem, not solution)
- **Branches** — Goals/Non-Goals · Functional Requirements · Non-Functional Requirements (perf/security/UX/reliability) · Constraints · Acceptance Criteria · Recommended Approach
- **Leaves** — concrete decisions inside each branch

Order branches by dependency: root before branches; foundational decisions (data model, scope) before downstream decisions (UX details, error handling).

Mark every node you can pre-resolve from Step 2 as `evidence-based` with a `file:line` citation. These become Decisions in the artifact, not interview questions.

This plan stays internal — do NOT present the tree to the developer unless asked.

## Step 4: Interview Loop

Walk the tree depth-first, parent before child. For each unresolved node:

1. **Recommended answer**: derive a recommendation from the developer's input + Step 2 evidence + project conventions. Every question must carry a recommendation — never ask without one.

2. **Choose question format**:

   - **`ask_user_question` tool** — when the question has 2-4 concrete options. Lead with the recommended option labeled `(Recommended)`. Example:

     > Use the `ask_user_question` tool. Question: "How should the feature be triggered — manual command, automatic on save, or both?". Header: "Trigger". Options: "Manual command (Recommended)" (Matches existing `/skill:*` pattern in `packages/rpiv-pi/skills/`); "Automatic on save" (Requires file-watcher wiring not currently in the extension); "Both" (Implement manual first, defer auto-trigger).

   - **Free-text with ❓ Question: prefix** — when the answer space is open-ended (problem framing, "what am I missing", scope edges). Always include the recommendation in the question body. Example:
     > "❓ Question: I'm reading this as 'export the current todo list as JSON'. Recommended scope: a single new command that writes to stdout, no UI changes. Does that match your intent, or is there more (filtering, formatting, persistence)?"

3. **Critical rules**:
   - Ask ONE question at a time. Wait for the answer before asking the next.
   - Walk the tree in dependency order — parent nodes before children, never the other way.
   - If a node is `evidence-based` from Step 2, record it as a Decision and skip to the next node — do not ask.
   - Lead with the most foundational unresolved question.
   - Every `ask_user_question` option-label cites concrete `file:line` evidence in its description, mirroring the `packages/rpiv-pi/skills/research/SKILL.md:103-142` checkpoint pattern. No abstract choices.

4. **Classify each response**:
   - **Decision** ("yes, that recommendation is right" / "use option B"): Record in Decisions. Resolve the node. Continue to the next.
   - **Correction** ("no, the real intent is X" / "you missed Y"): Re-run targeted Step 2 grep on the new area; spawn at most 1 additional narrow agent if the correction reveals a seam not yet probed. Adjust the affected subtree. Re-ask any descendants that depend on the corrected node.
   - **Scope adjustment** ("skip the UI part" / "include retries"): Update the tree — prune pruned branches, add new branches if needed. Record in Decisions.
   - **Defer** ("not sure, leave for later"): Add to Open Questions. Resolve the node by deferral. Continue.

5. **Batching**: When 2-4 sibling leaves are independent (answers don't depend on each other), you MAY batch them in a single `ask_user_question` call. Keep dependent questions sequential.

6. **Termination**: stop the loop when (a) every branch has a Decision or a Deferral, AND (b) the synthesized FRD would have no obvious gaps. Do not invent questions to pad the interview. Do NOT ask a final "looks good / want to adjust" rubber-stamp question — chain forward to research is automatic at Step 7.

## Step 5: Synthesize FRD Body

Read `templates/frd.md` (relative to this skill folder) at runtime to confirm the section list and frontmatter shape — do not inline it from memory.

Compile interview output into the FRD:

- **Summary** — 2-3 sentences capturing the settled feature concept.
- **Problem & Intent** — what the developer is solving and why, in the developer's framing.
- **Goals / Non-Goals** — explicit in/out lists from the interview.
- **Functional Requirements** — numbered, each independently testable.
- **Non-Functional Requirements** — perf, security, UX, accessibility, reliability constraints.
- **Constraints & Assumptions** — environmental, technical, schedule, organizational.
- **Acceptance Criteria** — observable pass conditions a reviewer can check.
- **Recommended Approach** — 1-2 sentences naming the architectural shape implied by the decisions (e.g., "new command in `packages/rpiv-pi/extensions/`, output to stdout, no persistence"). This text is what `research` passes to `scope-tracer` as the topic for breadth grounding.
- **Decisions** — full Q/A log per decision: `### [title]` + `**Question**:` (text as asked, or "Pre-resolved from codebase evidence") + `**Recommended**:` + `**Chosen**:` (developer's pick or evidence-derived answer) + `**Rationale**:` (1 line — why, or `evidence: path/to/file.ext:line` for codebase-derived). This block is the inheritance hook into research's Developer Context.
- **Open Questions** — only items the developer explicitly deferred.
- **References** — input files, mentioned tickets, related artifacts.

## Step 6: Write Artifact

1. **Determine metadata**:
   - Filename: `thoughts/shared/discover/<YYYY-MM-DD_HH-MM-SS>_<topic>.md`
     - Topic: kebab-case slug derived from the settled feature concept (lowercase, hyphens for spaces, strip special chars).
     - Timestamp guarantees uniqueness across invocations — no slug-collision check.
   - Repository name: from git root basename, or current directory basename if not a git repo.
   - Use the git branch and commit from the git context injected at the start of the session (or run `git branch --show-current` / `git rev-parse --short HEAD` directly; fallbacks: `no-branch` / `no-commit`).
   - Timestamp: run `date +"%Y-%m-%dT%H:%M:%S%z"` — raw for `date:` and `last_updated:`, first 19 chars (`T`→`_`, `:`→`-`) for filename slug.
   - Interviewer: from the User in the injected git context (fallback: `unknown`).

2. **Write the FRD** using the Write tool. Frontmatter `status: complete`. All template sections present and filled. The directory `thoughts/shared/discover/` is pre-scaffolded by `session-hooks.ts` — no `mkdir -p` needed in the skill.

## Step 7: Present and Chain

```
Intent captured to:
`thoughts/shared/discover/<YYYY-MM-DD_HH-MM-SS>_<topic>.md`

[N] requirements, [M] decisions, [K] open questions.

When ready, run `/skill:research thoughts/shared/discover/<YYYY-MM-DD_HH-MM-SS>_<topic>.md` to ground the intent in codebase reality.
The FRD's Decisions block is translated into research's Developer Context and inherited by design.
```

## Important Notes

- **Always interview-first**: Never write the FRD without running the interview loop. The artifact's value is the developer's voice, not the agent's guesses.
- **Always one question at a time**: Even with 2-4 batched independent questions, that's still one `ask_user_question` call — wait for answers before asking the next round.
- **Always provide a recommended answer**: Never present a question without your best guess. The developer is reviewing a proposal, not generating from scratch.
- **Never ask what the codebase already answers**: If Step 2 surfaced evidence, record the Decision with the `file:line` citation and move on.
- **Never write or edit source files**: This skill produces an artifact only. Source-file changes are `implement`'s job, far downstream.
- **Light fan-out only**: The codebase probe permits at most 2 agents per invocation (`codebase-locator` + optionally `codebase-analyzer`). Breadth discovery (`scope-tracer`, broad sweeps, `integration-scanner`) is `research`'s job — chain forward instead of expanding scope here.
- **Fresh artifact every invocation**: Each `/skill:discover` call writes a NEW timestamp-distinct file. To iterate on a prior FRD, re-invoke or manually Edit the prior file.
- **Frontmatter consistency**: Always include frontmatter, use snake_case for multi-word fields, keep tags relevant.
- **Critical ordering**: Follow the numbered steps exactly
  - ALWAYS detect input shape and read mentioned files before probing (Step 1 → Step 2)
  - ALWAYS probe the codebase before building the tree (Step 2 → Step 3)
  - ALWAYS pre-resolve evidence-based nodes before the interview loop (Step 3 → Step 4)
  - ALWAYS walk the tree in dependency order during the interview (Step 4)
  - ALWAYS synthesize from the interview log, never from memory of the conversation (Step 5)
  - NEVER skip the developer-facing interview — it's the entire point of this skill
  - NEVER ask a final "looks good / want to adjust" rubber-stamp question (anti-pattern per `a93e591`)
