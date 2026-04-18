---
date: 2026-04-14T09:14:53Z
planner: Claude Code
git_commit: ca15c82
branch: master
repository: rpiv-pi
topic: "Professional README rewrite with clean onboarding, 3-tier prerequisites, pipeline-ordered skills, and troubleshooting"
tags: [plan, readme, onboarding, badges, troubleshooting, package-json]
status: ready
design_source: "thoughts/shared/designs/2026-04-14_08-56-08_professional-readme-rewrite.md"
last_updated: 2026-04-14
last_updated_by: Claude Code
---

# Professional README Rewrite Implementation Plan

## Overview

Rewrite `README.md` to a professional standard following industry conventions (Playwright/Claude Code model). Introduces badges, 3-tier prerequisites, numbered Quick Start, pipeline-ordered skill groupings, troubleshooting, and migration guide. Updates `package.json` with scoped name and MIT license field.

## Desired End State

A new user sees badges, description, prerequisites, 4-step Quick Start, pipeline-ordered skills, configuration, troubleshooting, upgrading guide, and MIT license. An upgrading 0.3.x user finds all 4 `@juicesharp/rpiv-*` package names and config-path cutover instructions.

## What We're NOT Doing

- LICENSE file creation (optional, not blocking)
- Sibling README changes
- Code changes (index.ts, package-checks.ts, etc.)
- Screenshot/visual assets
- TOC or separate docs site

## Phase 1: Package Metadata

### Overview
Update `package.json` with the scoped name `@juicesharp/rpiv-pi` and add the `license` field. This must precede Phase 2 because the README references the scoped install command.

### Changes Required:

#### 1. Package name and license
**File**: `package.json`
**Changes**: Change `"name"` from `"rpiv-pi"` to `"@juicesharp/rpiv-pi"`, add `"license": "MIT"` field.

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

### Success Criteria:

#### Automated Verification:
- [x] `package.json` is valid JSON: `node -e "JSON.parse(require('fs').readFileSync('package.json'))"`
- [x] Name is scoped: `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json')).name)" | grep "@juicesharp/rpiv-pi"`
- [x] License field present: `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json')).license)" | grep MIT`

#### Manual Verification:
- [x] Scoped name matches sibling convention (`@juicesharp/rpiv-*`)
- [x] `license` field appears between `keywords` and `type`

---

## Phase 2: README Rewrite

### Overview
Complete rewrite of `README.md` with professional structure: badges, lede, prerequisites, Quick Start, pipeline-ordered skills, configuration, upgrading guide, troubleshooting, and license.

Depends on: Phase 1 (README references `@juicesharp/rpiv-pi` from package.json name).

### Changes Required:

#### 1. Full README replacement
**File**: `README.md`
**Changes**: Replace entire file with professional README following the design artifact's content.

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

### Success Criteria:

#### Automated Verification:
- [x] No local paths remain: `grep -c "/Users/" README.md` returns 0
- [x] No `pi-permission-system` references: `grep -c "pi-permission-system" README.md` returns 0
- [x] All 4 sibling packages named in upgrading section: `grep -c "@juicesharp/rpiv-" README.md` returns ≥ 4
- [x] Badges present: `grep -c "img.shields.io" README.md` returns ≥ 1
- [x] MIT license section present: `grep -c "## License" README.md` returns 1
- [x] Troubleshooting section present: `grep -c "## Troubleshooting" README.md` returns 1

#### Manual Verification:
- [x] Quick Start has 4 numbered steps with fenced bash blocks
- [x] Skills are grouped as pipeline-ordered sections (Research & Design, Implementation, Testing, Annotation, Utilities)
- [x] Troubleshooting table covers 6 failure modes with symptom/cause/fix columns
- [x] "Upgrading from 0.3.x" section names all 4 `@juicesharp/rpiv-*` packages
- [x] `pi install npm:@juicesharp/rpiv-pi` matches the scoped name from Phase 1
- [x] "First session" subsection has 3 bullets (agent copy, scaffolding, missing-plugin warning)
- [x] No exact file counts or line numbers that can go stale

---

## Testing Strategy

### Automated:
- JSON validity check on `package.json`
- grep checks for stale local paths, missing badges, missing sections, missing sibling package names

### Manual Testing Steps:
1. Open `README.md` in GitHub preview — verify badges render (may show "not published yet" until first publish under scoped name)
2. Walk through Quick Start steps as a new user — each command should be copy-pasteable
3. Verify Troubleshooting table columns align and are readable
4. Check that skill tables have correct Input/Output/Description columns
5. Verify "Upgrading from 0.3.x" lists all 4 packages and mentions config-path cutover

## Performance Considerations

None — documentation only.

## Migration Notes

Not applicable (this IS the migration documentation update).

## References

- Design: `thoughts/shared/designs/2026-04-14_08-56-08_professional-readme-rewrite.md`
- Research: `thoughts/shared/research/2026-04-14_12-28-29_rework-readme-professional-setup.md`
