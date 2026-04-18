---
date: 2026-04-14T08:56:08Z
designer: Claude Code
git_commit: ca15c82
branch: master
repository: rpiv-pi
topic: "Professional README rewrite with clean onboarding, 3-tier prerequisites, pipeline-ordered skills, and troubleshooting"
tags: [design, readme, onboarding, professional, badges, prerequisites, troubleshooting, pipeline]
status: complete
research_source: "thoughts/shared/research/2026-04-14_12-28-29_rework-readme-professional-setup.md"
last_updated: 2026-04-14T08:56:08Z
last_updated_by: Claude Code
---

# Design: Professional README Rewrite

## Summary

Complete restructure of `README.md` following industry-standard conventions (Playwright/Claude Code model). Replaces the flat requirements list with a 3-tier prerequisite model, introduces numbered Quick Start steps, presents skills as pipeline-ordered groupings, adds badges, troubleshooting, and License section. Updates `package.json` with the scoped name and MIT license field.

## Requirements

- Brand-new-user seamless onboarding — every step in the correct order
- 3-tier prerequisite split: user-installs (Pi CLI, Node.js, git) only in Prerequisites section; Pi-bundled and rpiv-family explained inline
- Numbered Quick Start with copy-pasteable commands
- Pipeline-ordered skill groupings (Research & Design → Implementation → Testing → Annotation → Utilities)
- "First session" subsection documenting auto-copy, scaffolding, and missing-plugin warning
- Troubleshooting section covering 6 failure modes from the research
- Migration guide naming all 4 `@juicesharp/rpiv-*` packages with config-path cutover
- npm version + license badges
- `## License` → MIT section
- Replace local path `pi install /Users/sguslystyi/rpiv-pi` with `pi install npm:@juicesharp/rpiv-pi`
- Document behaviors and flows, not exact counts or file listings that go stale

## Current State Analysis

### Key Discoveries

- `README.md:33` uses local path `pi install /Users/sguslystyi/rpiv-pi` — only works for the author
- `README.md:5` has bare `Version: 0.4.0` — should be a description paragraph; version belongs in badges and `package.json`
- `README.md:7-22` lists Tier 2 (Pi-bundled) and Tier 3 (siblings) together under "Requirements", omitting Tier 1 (Pi CLI, Node.js, git) entirely
- `package.json:3` has `"name": "rpiv-pi"` (unscoped) — inconsistent with sibling convention `@juicesharp/rpiv-*`
- `package.json` missing `"license": "MIT"` field
- `README.md:129-132` `## Notes` section buries important configuration (concurrency, artifact paths) in a footnote
- No Troubleshooting section — 6 actionable failure modes are undocumented
- No License section — inconsistent with all 4 sibling READMEs

### Patterns to Follow

- Sibling READMEs: lede paragraph under title, `## License` → MIT footer, "Then restart your Pi session" trailer
- Industry standard (Playwright, Claude Code, ESLint): badges, numbered quick-start, explicit prerequisites
- Precedent lesson from 4 README rewrites in 3 days: document behaviors/flows, not exact counts

### Constraints

- README must be ~150-180 lines (no TOC needed)
- No screenshot — orchestrator has no single UI element
- No `pi-permission-system` mentions (dead since 0.4.0)
- `/skill:` prefix is correct and hardcoded in Pi runtime

## Scope

### Building

- `README.md` complete rewrite with professional structure
- `package.json` name update to `@juicesharp/rpiv-pi` and license field addition

### Not Building

- LICENSE file creation (optional, not blocking)
- Sibling README changes
- Code changes (index.ts, package-checks.ts, etc.)
- Screenshot/visual assets
- TOC or separate docs site

## Decisions

### D1: Install Command

**Ambiguity**: `package.json:3` has unscoped `"name": "rpiv-pi"` but all siblings use `@juicesharp/rpiv-*`.

**Explored**:
- Option A: `pi install npm:@juicesharp/rpiv-pi` — consistent with siblings, requires package.json name update
- Option B: `pi install rpiv-pi` — keeps unscoped name, breaks convention

**Decision**: Option A — `pi install npm:@juicesharp/rpiv-pi`. Developer confirmed.

### D2: Badges

**Ambiguity**: Industry standard (Playwright, ESLint, Biome) uses badges; all 4 siblings have zero badges.

**Explored**:
- Option A: Add npm version + MIT license badges — professional standard as ecosystem face
- Option B: No badges — match family convention

**Decision**: Option A — add badges. Developer confirmed the parent README should set a higher standard as the ecosystem's entry point.

### D3: Install Instruction Format

**Decision**: Fenced bash blocks for the numbered multi-step Quick Start. Siblings use indented prose for single-command installs; the parent's 4-step flow warrants fenced blocks (matching Claude Code, ESLint, Playwright patterns).

### D4: Prerequisites Scope

**Decision**: List only Tier 1 (Pi CLI, Node.js, git as recommended) in Prerequisites section. Tier 2 (Pi-bundled) is explained implicitly. Tier 3 (siblings) is handled inline in Quick Start via `/rpiv-setup`.

### D5: Skills Presentation

**Decision**: Pipeline-ordered groupings in 4 tables: Research & Design, Implementation, Testing, Utilities. Annotation grouped under Research & Design or as separate section. Each table has Skill, Input, Output, Description columns.

### D6: Session-Start Documentation

**Decision**: Concise "First session" subsection (3-4 bullets) under Quick Start covering: agent auto-copy, directory scaffolding, missing-plugin warning.

### D7: Notes Promotion

**Decision**: Promote `## Notes` content into Configuration (concurrency), Usage (artifact paths), and Troubleshooting sections. Remove standalone Notes section.

### D8: Architecture Section

**Decision**: Include a minimal ASCII tree (3-4 lines) showing package structure — compact enough to avoid staleness, helpful for onboarding.

## Architecture

### package.json — MODIFY

```json
{
  "name": "@juicesharp/rpiv-pi",
  "version": "0.4.0",
  "description": "Skill-based development workflow for Pi — research, design, plan, implement, review",
  "keywords": ["pi-package", "pi-extension"],
  "license": "MIT",
  "type": "module",
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*",
    "@tintinweb/pi-subagents": "*",
    "@juicesharp/rpiv-ask-user-question": "*",
    "@juicesharp/rpiv-todo": "*",
    "@juicesharp/rpiv-advisor": "*",
    "@juicesharp/rpiv-web-tools": "*"
  }
}
```

### README.md — MODIFY

```markdown
# rpiv-pi

[![npm version](https://img.shields.io/npm/v/@juicesharp/rpiv-pi.svg)](https://www.npmjs.com/package/@juicesharp/rpiv-pi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Skill-based development workflow for [Pi](https://github.com/badlogic/pi-mono) — research, design, plan, implement, review. rpiv-pi extends the Pi coding agent with a pipeline of chained AI skills, named subagents for parallel analysis, and session lifecycle hooks for automatic context injection.

## Prerequisites

- **[Pi CLI](https://github.com/badlogic/pi-mono)** — the `pi` command must be available
- **Node.js** — required by Pi
- **git** *(recommended)* — rpiv-pi works without it, but branch and commit context won't be available to skills

## Quick Start

1. Install rpiv-pi:

```bash
pi install npm:@juicesharp/rpiv-pi
```

2. Start a Pi session and install sibling plugins:

```
/rpiv-setup
```

3. Restart your Pi session.

4. *(Optional)* Configure web search:

```
/web-search-config
```

### First Session

On first session start, rpiv-pi automatically:
- Copies agent profiles to `<cwd>/.pi/agents/`
- Scaffolds `thoughts/shared/` directories for pipeline artifacts
- Shows a warning if any sibling plugins are missing

## Usage

### Typical Workflow

```
/skill:research-questions "how does X work"
/skill:research thoughts/shared/questions/<latest>.md
/skill:design thoughts/shared/research/<latest>.md
/skill:write-plan thoughts/shared/designs/<latest>.md
/skill:implement-plan thoughts/shared/plans/<latest>.md Phase <N>
```

Each skill produces an artifact consumed by the next. Run them in order, or jump in at any stage if you already have the input artifact.

### Skills

Invoke via `/skill:<name>` from inside a Pi session.

#### Research & Design

| Skill | Input | Output | Description |
|---|---|---|---|
| `research-questions` | — | `thoughts/shared/questions/` | Generate research questions from codebase discovery |
| `research` | Questions artifact | `thoughts/shared/research/` | Answer questions via parallel analysis agents |
| `research-solutions` | — | `thoughts/shared/solutions/` | Compare solution approaches with pros/cons |
| `design` | Research or solutions artifact | `thoughts/shared/designs/` | Design features via vertical-slice decomposition |

#### Implementation

| Skill | Input | Output | Description |
|---|---|---|---|
| `write-plan` | Design artifact | `thoughts/shared/plans/` | Create phased implementation plans |
| `implement-plan` | Plan artifact | Code changes | Execute plans phase by phase |
| `iterate-plan` | Plan artifact | Updated plan | Revise plans based on feedback |
| `validate-plan` | Plan artifact | Validation report | Verify plan execution |

#### Testing

| Skill | Input | Output | Description |
|---|---|---|---|
| `outline-test-cases` | — | `.rpiv/test-cases/` | Discover testable features with per-feature metadata |
| `write-test-cases` | Outline metadata | Test case specs | Generate manual test specifications |

#### Annotation

| Skill | Input | Output | Description |
|---|---|---|---|
| `annotate-guidance` | — | `.rpiv/guidance/*.md` | Generate architecture guidance files |
| `annotate-inline` | — | `CLAUDE.md` files | Generate inline documentation |
| `migrate-to-guidance` | CLAUDE.md files | `.rpiv/guidance/` | Convert inline docs to guidance format |

#### Utilities

| Skill | Description |
|---|---|
| `code-review` | Comprehensive code reviews analyzing changes in parallel |
| `commit` | Structured git commits grouped by logical change |
| `create-handoff` | Context-preserving handoff documents for session transitions |
| `resume-handoff` | Resume work from a handoff document |

### Commands

| Command | Description |
|---|---|
| `/rpiv-setup` | Install all sibling plugins in one go |
| `/rpiv-update-agents` | Refresh agent profiles from bundled defaults |
| `/advisor` | Configure advisor model and reasoning effort |
| `/todos` | Show current todo list |
| `/web-search-config` | Set Brave Search API key |

### Agents

Agents are dispatched automatically by skills via the `Agent` tool — you don't invoke them directly.

| Agent | Purpose |
|---|---|
| `codebase-analyzer` | Analyzes implementation details for specific components |
| `codebase-locator` | Locates files and components relevant to a task |
| `codebase-pattern-finder` | Finds similar implementations and usage patterns |
| `integration-scanner` | Maps inbound references, outbound deps, and config wiring |
| `precedent-locator` | Finds similar past changes in git history |
| `test-case-locator` | Finds existing test cases and reports coverage stats |
| `thoughts-analyzer` | Deep-dive analysis on research topics |
| `thoughts-locator` | Discovers relevant documents in the `thoughts/` directory |
| `web-search-researcher` | Researches web-based information and documentation |

## Architecture

```
rpiv-pi/
├── extensions/rpiv-core/   — runtime extension: hooks, commands, guidance injection
├── skills/                 — AI workflow skills (research → design → plan → implement)
├── agents/                 — named subagent profiles dispatched by skills
└── thoughts/shared/        — pipeline artifact store
```

Pi discovers extensions via `"extensions": ["./extensions"]` and skills via `"skills": ["./skills"]` in `package.json`.

## Configuration

- **Web search** — run `/web-search-config` to set the Brave Search API key, or set the `BRAVE_SEARCH_API_KEY` environment variable
- **Advisor** — run `/advisor` to select a reviewer model and reasoning effort
- **Agent concurrency** — `@tintinweb/pi-subagents` defaults to 4 concurrent agents; raise via `/agents → Settings → Max concurrency → 48` if skills stall on wide fan-outs
- **Agent profiles** — editable at `<cwd>/.pi/agents/`; refresh from bundled defaults with `/rpiv-update-agents`

## Upgrading from 0.3.x

Tool logic was extracted into sibling plugins in 0.4.0. After upgrading:

1. `pi install npm:@juicesharp/rpiv-pi`
2. Start a Pi session.
3. Run `/rpiv-setup` to install the four extracted plugins:
   - `@juicesharp/rpiv-ask-user-question`
   - `@juicesharp/rpiv-todo`
   - `@juicesharp/rpiv-advisor`
   - `@juicesharp/rpiv-web-tools`
4. Restart the session.
5. Re-run `/advisor` and `/web-search-config` — saved configuration at `~/.config/rpiv-pi/` is no longer read; each plugin now reads from its own config path.

The `BRAVE_SEARCH_API_KEY` environment variable continues to work unchanged.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Warning about missing siblings on session start | Sibling plugins not installed | Run `/rpiv-setup` |
| `/rpiv-setup` fails on a package | Network or registry issue | Check connection, retry with `pi install npm:<pkg>`, re-run `/rpiv-setup` |
| `/rpiv-setup` says "requires interactive mode" | Running in headless mode | Install manually: `pi install npm:<pkg>` for each sibling |
| `web_search` or `web_fetch` errors | Brave API key not configured | Run `/web-search-config` or set `BRAVE_SEARCH_API_KEY` |
| `advisor` tool not available after upgrade | Advisor model selection lost | Run `/advisor` to re-select a model |
| Skills hang or serialize agent calls | Agent concurrency too low | Raise via `/agents → Settings → Max concurrency → 48` |

## License

MIT
```

## Desired End State

A new user visits the rpiv-pi GitHub repo and sees:

1. **Title + badges**: npm version and MIT license badges immediately signal professionalism
2. **Description**: One-paragraph lede explaining what rpiv-pi does
3. **Prerequisites**: Clear list of what they need before installing (Pi CLI, Node.js, git)
4. **Quick Start**: 4 numbered steps — `pi install`, `/rpiv-setup`, restart, `/web-search-config` — each in a fenced block
5. **First session**: Brief explanation of what happens automatically
6. **Usage**: Pipeline-ordered skills showing the research→design→plan→implement flow
7. **Configuration**: Web search, advisor, concurrency settings
8. **Troubleshooting**: 6 failure modes with exact remediation
9. **Upgrading**: Migration guide for 0.3.x users
10. **License**: MIT

An upgrading user from 0.3.x can jump to "Upgrading from 0.3.x" and find all 4 `@juicesharp/rpiv-*` package names and config-path cutover instructions.

## File Map

```
README.md                          # MODIFY — complete professional rewrite
package.json                       # MODIFY — name + license field
```

## Ordering Constraints

- package.json name change must precede README.md (README references the install command)
- No parallelism needed — 2 files, sequential dependency

## Verification Notes

- `pi install npm:@juicesharp/rpiv-pi` command matches package.json name
- All 6 failure modes from research artifact appear in Troubleshooting
- All 4 `@juicesharp/rpiv-*` packages named in migration section
- No `pi-permission-system` references
- No local paths
- No exact counts that can go stale (use "N skills" or count dynamically)
- Badges render (npm name matches actual npm package)
- License section present with MIT

## Performance Considerations

None — documentation only.

## Migration Notes

Not applicable (this IS the migration documentation update).

## Pattern References

- `/Users/sguslystyi/rpiv-advisor/README.md` — sibling convention: lede, indented install, restart trailer, License MIT
- `/Users/sguslystyi/rpiv-todo/README.md` — sibling convention: Tool/Commands/Overlay sections
- `/Users/sguslystyi/rpiv-web-tools/README.md` — sibling convention: Tools/Commands/API key sections
- Playwright README — multi-path onboarding table pattern
- Claude Code README — numbered quick-start with platform blocks
- ESLint README — prerequisites + FAQ/troubleshooting pattern

## Developer Context

**Q (install command)**: `package.json:3` has `"name": "rpiv-pi"` (unscoped) but siblings are `@juicesharp/rpiv-*`. What's the correct `pi install` command?
**A**: `pi install npm:@juicesharp/rpiv-pi` — update package.json name to match.

**Q (badges)**: Industry standard uses badges; siblings have none. Should parent add them?
**A**: Yes, add npm version + MIT license badges. Parent is ecosystem face, should set higher standard.

**Q (from research) git prerequisite**: Hard or soft?
**A**: Soft — list as "recommended".

**Q (from research) skills presentation**: Pipeline groupings or flat table?
**A**: Pipeline-ordered groupings with Input/Output columns.

**Q (from research) session-start**: Document in detail or omit?
**A**: Concise "First session" subsection (3-4 bullets).

## Design History

- Slice 1: package.json metadata — approved as generated
- Slice 2: README.md rewrite — approved as generated

## References

- Research: `thoughts/shared/research/2026-04-14_12-28-29_rework-readme-professional-setup.md`
- Questions: `thoughts/shared/questions/2026-04-13_23-21-05_rework-readme-professional-setup.md`
- Extraction design: `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md`
- Sibling READMEs: `rpiv-advisor`, `rpiv-todo`, `rpiv-ask-user-question`, `rpiv-web-tools`
