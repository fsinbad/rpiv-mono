---
date: 2026-04-18T04:11:30Z
researcher: Sergii
git_commit: 0c8320b
branch: main
repository: rpiv-pi
topic: "Agent coverage gap analysis and new agent proposals"
confidence: high
complexity: medium
status: ready
tags: [solutions, agents, coverage, gap-analysis, pipeline]
last_updated: 2026-04-18
last_updated_by: Sergii
---

# Solution Analysis: Agent Coverage Gap Analysis & New Agent Proposals

**Date**: 2026-04-18T04:11:30Z
**Researcher**: Sergii
**Git Commit**: 0c8320b
**Branch**: main
**Repository**: rpiv-pi

## Research Question
Analyze all 9 agents in `agents/`, trace their research vectors, project their coverage against all 17 skills, identify capability gaps, and propose new agents to fill those gaps.

## Summary
**Problem**: Two skills (validate, resume-handoff) use `general-purpose` agents instead of named specialists; 4-5 pipeline skills lack forward-looking impact analysis; test-case skills lack flow tracing; discover lacks structured requirement extraction.
**Recommended**: Add 4 new agents in priority order: verification-checker (P0), impact-estimator (P1), state-verifier (P2), requirements-extractor (P3). Defer dependency-auditor and flow-tracer.
**Effort**: Medium (~8 hours total across all 4 agents)
**Confidence**: High

## Problem Statement

**Requirements:**
- Eliminate all `general-purpose` agent usage in skills (validate uses 2, resume-handoff uses 1)
- Provide forward-looking impact analysis for planning and design decisions
- Fill capability gaps in the agent vector space where skills are overloading existing agents

**Constraints:**
- New agents must follow the existing `.md` definition pattern (no code changes needed)
- Tool access must respect the capability tier model (bash = git-only currently)
- Agents are isolated, read-only workers — no agent dispatches another agent
- Auto-sync mechanism (`extensions/rpiv-core/agents.ts`) deploys agents automatically

**Success criteria:**
- All skills use named specialist agents instead of `general-purpose`
- Pipeline skills (plan, design, explore) can ground their decisions in codebase impact analysis
- Each agent has a distinct research vector that doesn't overlap with existing agents

## Current State

**Existing agent coverage (9 agents, 4 capability tiers):**

| Agent | Vector | Tier | Tools |
|-------|--------|------|-------|
| codebase-locator | WHERE | Locator | grep, find, ls |
| integration-scanner | CONNECTIONS | Locator | grep, find, ls |
| test-case-locator | COVERAGE | Locator | grep, find, ls |
| thoughts-locator | DOCS-WHERE | Locator | grep, find, ls |
| codebase-analyzer | HOW | Analyzer | + read |
| codebase-pattern-finder | LIKE | Analyzer | + read |
| thoughts-analyzer | DOCS-HOW | Analyzer | + read |
| precedent-locator | HISTORY | Git | + bash (git only) |
| web-search-researcher | EXTERNAL | Web | + web_search, web_fetch |

**Relevant patterns:**
- Skill→agent dispatch: `Agent(subagent_type: "name", prompt: "...")` — used consistently across 12 of 17 skills
- Agent auto-sync: `extensions/rpiv-core/agents.ts:syncBundledAgents()` copies all `.md` files from `agents/` to `.pi/agents/` at session start
- Agent definition pattern: YAML frontmatter (name, description, tools, isolated) + structured prompt with Core Responsibilities, Strategy, Output Format, What NOT to Do

**Integration points:**
- `skills/validate/SKILL.md:52-54` — spawns 2 `general-purpose` agents (the primary gap)
- `skills/resume-handoff/SKILL.md:48` — spawns `general-purpose` agents for state verification
- `skills/plan/SKILL.md` — no agent dispatch at all; operates purely on design artifact
- `skills/explore/SKILL.md:49` — `integration-risk` and `migration-cost` dimensions scored by codebase-analyzer (not specialized for impact)
- `skills/write-test-cases/SKILL.md:95` — codebase-analyzer instructed to "Focus on understanding USER FLOWS" (overloading its purpose)

## Solution Options

### Option 1: verification-checker
**How it works:**
An analyzer-tier agent (tools: `bash, read, grep, find, ls`) that parses a plan's success criteria sections, executes each automated verification command via bash, checks file existence and pattern absence, and returns structured pass/fail per criterion with `file:line` evidence.

**Pros:**
- Eliminates the most visible gap — validate is the ONLY skill using `general-purpose` (`skills/validate/SKILL.md:52-54`)
- The validate skill's `allowed-tools` already includes `Bash(make *)` (`skills/validate/SKILL.md:5`), so bash access is already sanctioned at the skill level
- Well-established pattern in AI agent frameworks — AgentForge's Critic agent, CodeX-Verify's Correctness agent, Anthropic's CitationAgent all follow this "independent verification" pattern
- The plan template already structures success criteria as machine-parseable `- [ ] command: \`cmd\`` items (`skills/plan/SKILL.md:131-143`)

**Cons:**
- Breaks the `bash = git-only` convention (`agents/architecture.md:37-38`). However, this is justified because the validate skill already has `Bash(make *)` in its allowed-tools
- Bash execution risk — agent could theoretically run destructive commands. Mitigated by skill-level `allowed-tools` restrictions

**Complexity:** Low (~2 hours)
- Files to create: 1 (~100 lines)
- Files to modify: 2 (validate/SKILL.md, agents/architecture.md)
- Risk level: Low

### Option 2: impact-estimator
**How it works:**
An analyzer-tier agent (tools: `read, grep, find, ls`) that accepts a proposed change description, extracts the entities the change would touch, traces transitive references outward via import/call chains, counts affected files across layers, and returns a blast-radius report with risk score.

**Pros:**
- Fills a genuine gap: no existing agent does forward-looking impact projection. `integration-scanner` maps current connections; `precedent-locator` mines past changes. Neither projects FUTURE impact
- Benefits 4-5 skills: plan (validate phase scope), design (validate design reach), explore (score `integration-risk` dimension), revise (check revision blast radius), implement (pre-flight check)
- Zero new tool access — stays within the existing analyzer tier (`read, grep, find, ls`)
- Research confirms this pattern: multi-agent optimization frameworks include explicit "Evaluation Agent" roles (arXiv 2603.14703)

**Cons:**
- Overlap with `integration-scanner` in the reference-tracing step — but the input/output contract is fundamentally different (proposed change vs existing component; risk score vs connection map)
- Quality depends on how well the agent identifies primary change targets from natural-language descriptions

**Complexity:** Low (~3 hours)
- Files to create: 1 (~150 lines)
- Files to modify: 1 (agents/architecture.md)
- Risk level: Low

### Option 3: state-verifier
**How it works:**
A git-tier agent (tools: `bash, read, grep, find, ls`) that reads a handoff document, extracts `git_commit` and file references from frontmatter and sections, computes drift via `git diff <handoff-commit>..HEAD` for each referenced file, checks file existence, and returns a per-file status report (unchanged/modified/deleted/new-since) with an overall drift assessment.

**Pros:**
- Eliminates the second `general-purpose` gap — resume-handoff at `skills/resume-handoff/SKILL.md:48`
- Same tool set as `precedent-locator` (git-tier) — no new capability tier needed
- Complementary to `precedent-locator`: precedent-locator does semantic similarity search across history (past tense); state-verifier does exact delta computation from a known baseline (present tense)
- Handoff documents already store `git_commit` in frontmatter (`skills/create-handoff/SKILL.md:36`) — data is already available

**Cons:**
- Narrow adoption surface — only 1 direct consumer (resume-handoff)
- Requires degradation path when `git_commit: unknown` (the fallback at `skills/create-handoff/SKILL.md:24`)

**Complexity:** Low (~1 hour)
- Files to create: 1 (~100 lines)
- Files to modify: 1 (resume-handoff/SKILL.md)
- Risk level: Very low

### Option 4: requirements-extractor
**How it works:**
An analyzer-tier agent (tools: `read, grep, find, ls`) that reads tickets, specs, and user stories, then extracts structured requirements, acceptance criteria, constraints, and priorities into a checklist format. Returns a machine-consumable checklist that discover and design can use as input.

**Pros:**
- Fills a gap in discover — Step 1 currently says "Extract requirements, constraints, and goals" (`skills/discover/SKILL.md:28-31`) but does so as a one-line instruction to the orchestrator with no structured output
- Clean separation from `thoughts-analyzer`: thoughts-analyzer curates insights from structured pipeline artifacts; requirements-extractor imposes structure on unstructured external inputs
- Standard LLM text→structure extraction pattern — well within model capabilities
- Zero new tool access, zero architecture changes

**Cons:**
- Overlap risk with `thoughts-analyzer` in the general "read document → extract structured info" shape. Different enough (input domain, output schema, purpose) to justify separation
- Quality depends heavily on prompt engineering in the agent definition

**Complexity:** Low (~2 hours)
- Files to create: 1 (~100 lines)
- Files to modify: 1 (discover/SKILL.md)
- Risk level: Very low

### Option 5: dependency-auditor (DEFERRED)
**How it works:**
A runtime-execution agent that analyzes package manifests via `bash` (npm audit, pip audit) and reports version conflicts, deprecation status, license issues, and vulnerabilities.

**Why deferred:**
- Breaks `bash = git-only` convention without the same justification as verification-checker (no skill currently needs dependency auditing as a primary workflow)
- Cross-platform bash compatibility is a real risk (npm audit output varies across versions, pip-audit requires separate installation)
- Low adoption surface — would need conditional dispatch (dispatch only when manifest files are in scope), a pattern no skill currently implements
- The underlying tools (npm audit, Snyk, Dependabot) already exist; developers can run them directly
- Web-search-researcher can already look up CVEs and deprecation status for named packages

### Option 6: flow-tracer (DEFERRED)
**How it works:**
An analyzer-tier agent that traces user-facing end-to-end flows from entry points through data transformations, state changes, and response formatting, returning a numbered journey with step-type classification.

**Why deferred:**
- It's a narrow specialization of codebase-analyzer's existing "trace data flow" capability (`agents/codebase-analyzer.md:37-43`)
- The genuinely new part is the structured output format — achievable by enhancing codebase-analyzer's prompt with a flow-tracing strategy section rather than creating a new agent
- Risk of splitting write-test-cases Agent C's responsibilities (it currently handles both flow tracing AND validation/auth/UI extraction)
- Recommendation: enhance `codebase-analyzer.md` with a flow-tracing strategy section first, then evaluate whether a separate agent is still needed

## Comparison

| Criteria | verification-checker | impact-estimator | state-verifier | requirements-extractor |
|----------|---------------------|-------------------|----------------|----------------------|
| Complexity | Low | Low | Low | Low |
| Codebase fit | High (fills real gap) | High (4-5 skills) | Medium (1 skill) | Medium (1-2 skills) |
| Risk | Low | Low | Very low | Very low |
| Adoption surface | 1-2 skills | 4-5 skills | 1 skill | 1-2 skills |
| Pipeline impact | Critical (P0) | High (P1) | Medium (P2) | Medium (P3) |
| New tool access | bash (build/test) | None | None (same as precedent-locator) | None |

## Recommendation

**Selected:** All 4 accepted candidates, implemented in priority order.

### Rationale:
1. **verification-checker (P0)** — The most impactful gap. Validate is the only skill using `general-purpose`, which means its verification step has no specialist prompt, no structured output, and no consistent behavior. This is the low-hanging fruit with the highest visibility.
2. **impact-estimator (P1)** — The widest adoption surface. Plan has NO agent dispatch at all; design and explore lack forward-looking analysis. This agent adds a genuinely new vector (FUTURE impact) that no existing agent covers.
3. **state-verifier (P2)** — Quick win. Same tool tier as precedent-locator, one-skill adoption, very low effort. Eliminates the second `general-purpose` gap.
4. **requirements-extractor (P3)** — Improves discover quality. Low effort, clean separation from thoughts-analyzer.

### Why not the deferred candidates:
- **dependency-auditor**: Breaks bash convention, cross-platform risk, low adoption, existing tools already cover the capability
- **flow-tracer**: Overlaps codebase-analyzer's existing capability. Better to enhance the existing agent's prompt first.

### Trade-offs:
- Accepting bash expansion beyond git-only (for verification-checker) in exchange for eliminating `general-purpose` from validate. Justified because the skill already has `Bash(make *)` in its allowed-tools.
- Accepting narrow adoption for state-verifier in exchange for completeness (no `general-purpose` usage remains).

### Implementation approach:
1. **Phase 1: verification-checker** — Create agent, update validate skill, update architecture docs
2. **Phase 2: impact-estimator** — Create agent, optionally update plan/explore skills
3. **Phase 3: state-verifier** — Create agent, update resume-handoff skill
4. **Phase 4: requirements-extractor** — Create agent, update discover skill

### Integration points:
- `agents/verification-checker.md` — new file
- `agents/impact-estimator.md` — new file
- `agents/state-verifier.md` — new file
- `agents/requirements-extractor.md` — new file
- `skills/validate/SKILL.md:52-54` — replace general-purpose with verification-checker + codebase-analyzer + codebase-pattern-finder
- `skills/resume-handoff/SKILL.md:48` — replace general-purpose with state-verifier
- `skills/discover/SKILL.md:28-31` — add requirements-extractor dispatch
- `.rpiv/guidance/agents/architecture.md` — add new agents to module structure, update capability tiers

### Patterns to follow:
- Agent definition pattern: `agents/precedent-locator.md` (for state-verifier, which also uses bash)
- Analyzer definition pattern: `agents/codebase-analyzer.md` (for impact-estimator and requirements-extractor)
- Bash-scoped agent: `agents/precedent-locator.md:114` (for verification-checker's bash constraints)

### Risks:
- **Bash scope expansion**: Adding verification-checker with bash for build/test creates a precedent. Mitigated by documenting the new tier clearly in architecture.md and restricting verification-checker to commands from the plan's success criteria section.
- **Output quality variance**: New agents are prompt-engineered, not tested. Mitigated by the skill's existing developer checkpoints (each skill has `ask_user_question` confirmations before proceeding).

## Scope Boundaries

**What we're building:**
- 4 new agent `.md` files following the existing definition pattern
- Skill modifications to replace `general-purpose` dispatch with named agents
- Architecture documentation updates

**What we're NOT doing:**
- NOT adding dependency-auditor (deferred)
- NOT adding flow-tracer (deferred; enhance codebase-analyzer instead)
- NOT modifying the agent sync mechanism (`extensions/rpiv-core/agents.ts`)
- NOT modifying the agent dispatch runtime (`@tintinweb/pi-subagents`)
- NOT adding automated tests (the project has no test infrastructure)

## Testing Strategy

**Unit tests:**
- N/A — agents are markdown prompts, not executable code

**Integration tests:**
- Invoke `/skill:validate` with a real plan → confirm verification-checker is dispatched (not general-purpose)
- Invoke `/skill:resume-handoff` with a real handoff → confirm state-verifier is dispatched
- Invoke `/skill:discover` with a ticket → confirm requirements-extractor produces a checklist
- Invoke impact-estimator via a test prompt → confirm blast-radius report quality

**Manual verification:**
- [ ] verification-checker returns structured pass/fail per success criterion
- [ ] impact-estimator identifies transitive dependents not caught by integration-scanner
- [ ] state-verifier detects drift between handoff commit and current HEAD
- [ ] requirements-extractor produces a checklist with acceptance criteria from raw ticket text
- [ ] No skill still references `general-purpose` after all phases complete
- [ ] All new agents auto-sync to `.pi/agents/` at session start

## Open Questions

**Resolved during research:**
- "Does verification-checker need bash?" — Yes, for running build/test/lint commands. The validate skill already has `Bash(make *)` in allowed-tools (`skills/validate/SKILL.md:5`), so this is sanctioned.
- "Does impact-estimator overlap integration-scanner?" — No. Integration-scanner maps CURRENT connections to an EXISTING component. Impact-estimator projects FUTURE impact of a PROPOSED change. Different tense, different input, different output.
- "Does state-verifier overlap precedent-locator?" — No. Precedent-locator does semantic similarity search across git history (past tense). State-verifier does exact delta from a known commit (present tense).

**Requires user input:**
- Should verification-checker be allowed to run arbitrary build/test commands, or only those listed in the plan's success criteria? — Default assumption: only commands from the plan.
- Should impact-estimator be integrated into plan skill (currently no agents), or kept optional? — Default assumption: optional first, integrate after quality validation.

**Blockers:**
- None identified — all 4 agents can be implemented immediately.

## References

- `agents/codebase-analyzer.md` — Pattern for analyzer-tier agents
- `agents/precedent-locator.md` — Pattern for bash-enabled agents (git tier)
- `agents/integration-scanner.md` — Complement to impact-estimator (current-state vs future-state)
- `skills/validate/SKILL.md:52-54` — Primary gap (general-purpose usage)
- `skills/resume-handoff/SKILL.md:48` — Secondary gap (general-purpose usage)
- `skills/plan/SKILL.md` — No agent dispatch (impact-estimator adoption site)
- `skills/discover/SKILL.md:28-31` — Inline requirement extraction (requirements-extractor adoption site)
- `.rpiv/guidance/agents/architecture.md` — Agent architecture constraints and capability tiers
- AgentForge (arXiv 2604.13120) — Production reference for Planner→Coder→Tester→Debugger→Critic pipeline
- CodeX-Verify (arXiv 2511.16708) — Proof that specialized verification agents outperform general-purpose ones
- Anthropic Multi-Agent Research System — Independent CitationAgent as verification pattern
