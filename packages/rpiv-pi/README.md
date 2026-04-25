# rpiv-pi

[![npm version](https://img.shields.io/npm/v/@juicesharp/rpiv-pi.svg)](https://www.npmjs.com/package/@juicesharp/rpiv-pi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Pi compatibility** — `rpiv-pi` `0.12.x` tracks the current `@mariozechner/pi-coding-agent` release line. If you see peer-dep resolution issues after a Pi upgrade, open an issue.

Skill-based development workflow for [Pi Agent](https://github.com/badlogic/pi-mono) — discover, research, design, plan, implement, and validate. rpiv-pi extends Pi Agent with a pipeline of chained AI skills, named subagents for parallel analysis, and session lifecycle hooks for automatic context injection.

## Prerequisites

- **Node.js** — required by Pi Agent
- **[Pi Agent](https://github.com/badlogic/pi-mono)** — install globally so the `pi` command is available:

  ```bash
  npm install -g @mariozechner/pi-coding-agent
  ```

- **Model provider** *(first-time Pi Agent users only — skip if `/login` already works or `~/.pi/agent/models.json` is configured)*. Pick one:

  - **Subscription login** — start Pi Agent and run `/login` to authenticate with Anthropic Claude Pro/Max, ChatGPT Plus/Pro, GitHub Copilot, or Gemini.
  - **BYOK (API key)** — edit `~/.pi/agent/models.json` and add a provider entry with `baseUrl`, `api`, `apiKey`, and `models[]`. Example (z.ai GLM coding plan):

    ```json
    {
      "providers": {
        "zai": {
          "baseUrl": "https://api.z.ai/api/coding/paas/v4",
          "api": "openai-completions",
          "apiKey": "XXXXXXXXX",
          "compat": {
            "supportsDeveloperRole": false,
            "thinkingFormat": "zai"
          },
          "models": [
            {
              "id": "glm-5.1",
              "name": "glm-5.1 [coding plan]",
              "reasoning": true,
              "input": ["text"],
              "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
              "contextWindow": 204800,
              "maxTokens": 131072
            }
          ]
        }
      }
    }
    ```

- **git** *(recommended)* — rpiv-pi works without it, but branch and commit context won't be available to skills.

## Quick Start

1. Install rpiv-pi:

```bash
pi install npm:@juicesharp/rpiv-pi
```

2. Start a Pi Agent session and install sibling plugins:

```
/rpiv-setup
```

3. Restart your Pi Agent session.

4. *(Optional)* Configure web search:

```
/web-search-config
```

### First Session

On first Pi Agent session start, rpiv-pi automatically:
- Copies agent profiles to `<cwd>/.pi/agents/`
- Detects outdated or removed agents on subsequent starts
- Scaffolds `thoughts/shared/` directories for pipeline artifacts
- Shows a warning if any sibling plugins are missing

## Usage

### Typical Workflow

```
/skill:discover "how does X work"
/skill:research thoughts/shared/questions/<latest>.md
/skill:design thoughts/shared/research/<latest>.md
/skill:plan thoughts/shared/designs/<latest>.md
/skill:implement thoughts/shared/plans/<latest>.md Phase <N>
```

Each skill produces an artifact consumed by the next. Run them in order, or jump in at any stage if you already have the input artifact.

### Recipes

Skills compose. Pick the entry point that matches your intent:

- **Form context before a task** — `/skill:discover "[topic]"` → `/skill:research <questions artifact>`. Produces a high-signal subspace of the codebase relevant to your topic, ready to feed directly into the next prompt.
- **Compare approaches before designing** — `/skill:explore "[problem]"` → `/skill:design <solutions artifact>`. Use when multiple valid solutions exist; the solutions artifact is a first-class input to `design` alongside a `research` artifact.
- **Full feature build** — `/skill:discover` → `research` → `design` → `plan` → `implement` → `validate` → (`code-review` ↔ `commit`). The default pipeline; jump in at any stage if you already have the input artifact. Review and commit are interchangeable in order — review `staged`/`working` before committing, or commit first and review the resulting branch (empty scope, first-parent vs default).
- **Investigate a bug** — `/skill:discover "why does X fail"` → `/skill:research <questions artifact>`. Fix from the research output without writing a plan when the change is small.
- **Adjust mid-implementation** — `/skill:revise <plan artifact>` → resume `/skill:implement`. Use when new constraints land after the plan is drafted.
- **Review before shipping** — `/skill:code-review` ↔ `/skill:commit`. Order is your call: review `staged`/`working` before committing to catch issues at the smallest blast radius, or commit first and review the resulting branch (empty scope defaults to feature-branch-vs-default-branch, first-parent). Produces a Quality/Security/Dependencies artifact under `thoughts/shared/reviews/` with claim-verifier-grounded findings and `status: approved | needs_changes`.
- **Audit a specific scope** — `/skill:code-review <commit|staged|working|hash|A..B|branch>`. Targeted lenses over a commit, range, staged/working tree, or PR branch; advisor adjudication applies when configured (`/advisor`).
- **Review-driven plan revision** — `/skill:code-review` → `/skill:revise <plan artifact>` → resume `/skill:implement`. When a mid-stream review surfaces structural findings that the existing plan can't absorb as spot fixes.
- **Scaffold manual UI test specs** — `/skill:outline-test-cases` → `/skill:write-test-cases <feature>`. Outline first via Frontend-First Discovery to map project scope and avoid duplicate coverage, then generate flow-based manual test cases (with a regression suite) under `.rpiv/test-cases/<feature>/`.
- **Hand off across sessions** — `/skill:create-handoff` → (new session) `/skill:resume-handoff <doc>`. Preserves context when stopping mid-task.
- **Onboard a fresh repo** — `/skill:annotate-guidance` once, then use the rest of the pipeline normally. Use `annotate-inline` instead if the project follows the `CLAUDE.md` convention.

### Skills

Invoke via `/skill:<name>` from inside a Pi Agent session.

#### Research & Design

| Skill | Input | Output | Description |
|---|---|---|---|
| `discover` | — | `thoughts/shared/questions/` | Generate research questions from codebase discovery |
| `research` | Questions artifact | `thoughts/shared/research/` | Answer questions via parallel analysis agents |
| `explore` | — | `thoughts/shared/solutions/` | Compare solution approaches with pros/cons |
| `design` | Research or solutions artifact | `thoughts/shared/designs/` | Design features via vertical-slice decomposition |

#### Implementation

| Skill | Input | Output | Description |
|---|---|---|---|
| `plan` | Design artifact | `thoughts/shared/plans/` | Create phased implementation plans |
| `implement` | Plan artifact | Code changes | Execute plans phase by phase |
| `revise` | Plan artifact | Updated plan | Revise plans based on feedback |
| `validate` | Plan artifact | Validation report | Verify plan execution |

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
| `code-review` | Comprehensive code reviews using specialist row-only agents (`diff-auditor`, `peer-comparator`, `claim-verifier`) at narrativisation-prone dispatch sites |
| `commit` | Structured git commits grouped by logical change |
| `create-handoff` | Context-preserving handoff documents for session transitions |
| `resume-handoff` | Resume work from a handoff document |

### Commands

| Command | Description |
|---|---|
| `/rpiv-setup` | Install all sibling plugins in one go |
| `/rpiv-update-agents` | Sync rpiv agent profiles: add new, update changed, remove stale |
| `/advisor` | Configure advisor model and reasoning effort |
| `/btw` | Ask a side question without polluting the main conversation |
| `/todos` | Show current todo list |
| `/web-search-config` | Set Brave Search API key |

### Agents

Agents are dispatched automatically by skills via the `Agent` tool — you don't invoke them directly.

| Agent | Purpose |
|---|---|
| `claim-verifier` | Grounds each supplied code-review claim against repository state and tags it Verified / Weakened / Falsified |
| `codebase-analyzer` | Analyzes implementation details for specific components |
| `codebase-locator` | Locates files, directories, and components relevant to a feature or task |
| `codebase-pattern-finder` | Finds similar implementations and usage examples with concrete code snippets |
| `diff-auditor` | Walks a patch against a caller-supplied surface-list and emits `file:line \| verbatim \| surface-id \| note` rows |
| `integration-scanner` | Maps inbound references, outbound dependencies, config registrations, and event subscriptions for a component |
| `peer-comparator` | Compares a new file against a peer sibling and tags each invariant Mirrored / Missing / Diverged / Intentionally-absent |
| `precedent-locator` | Finds similar past changes in git history — commits, blast radius, and follow-up fixes |
| `test-case-locator` | Catalogs existing manual test cases under `.rpiv/test-cases/` and reports coverage stats |
| `thoughts-analyzer` | Performs deep-dive analysis on a research topic in `thoughts/` |
| `thoughts-locator` | Discovers relevant documents in the `thoughts/` directory |
| `web-search-researcher` | Researches modern web-only information via deep search and fetch |

## Architecture

```
rpiv-pi/
├── extensions/rpiv-core/   — runtime extension: hooks, commands, guidance injection
├── skills/                 — AI workflow skills (research → design → plan → implement)
├── agents/                 — named subagent profiles dispatched by skills
└── thoughts/shared/        — pipeline artifact store
```

Pi Agent discovers extensions via `"extensions": ["./extensions"]` and skills via `"skills": ["./skills"]` in `package.json`.

## Configuration

- **Web search** — run `/web-search-config` to set the Brave Search API key, or set the `BRAVE_SEARCH_API_KEY` environment variable
- **Advisor** — run `/advisor` to select a reviewer model and reasoning effort
- **Side questions** — type `/btw <question>` anytime (even mid-stream) to ask the primary model a one-off question; answer appears in a borderless bottom overlay and never enters the main conversation
- **Agent concurrency** — on first `/rpiv-setup`, rpiv-pi persistently seeds `~/.pi/agent/extensions/subagent/config.json` with `parallel.concurrency: 4` and `maxSubagentDepth: 3`. The cap keeps rate-limit and cache pressure predictable; skills with wider fan-outs queue the remainder and drain as slots free. Edit that file to raise the limit (e.g. `parallel.concurrency: 48`); user values are preserved on subsequent `/rpiv-setup` runs.
- **Agent profiles** — editable at `<cwd>/.pi/agents/`; sync from bundled defaults with `/rpiv-update-agents` (overwrites rpiv-managed files, preserves your custom agents)

## Uninstall

rpiv-pi owns nicobailon's pi-subagents registration (runs it through an in-process proxy so the inline tool card stays quiet and the Subagents overlay is the live view). `/rpiv-setup` strips `"npm:pi-subagents"` from your `~/.pi/agent/settings.json#packages[]` to prevent Pi from loading it twice. If you remove rpiv-pi, subagents will stop loading until you re-add that entry.

The bundled built-in agents from `pi-subagents` (`scout`, `planner`, `oracle`, …) are hidden from both the `subagent` tool that the assistant dispatches to and the `/agents` manager overlay (and `ctrl+shift+a`). The overlay filter is best-effort — if a future `pi-subagents` release changes its manager UI, rpiv-pi will print one boot-time warning to stderr and the built-in rows will reappear in `/agents` until rpiv-pi ships an update. The assistant-side filter is unaffected by upstream changes. To re-enable a built-in agent yourself, edit `subagents.disableBuiltins` in `~/.pi/agent/settings.json` (set to `false` or delete the key) and restart Pi.

To fully uninstall:

1. Remove rpiv-pi from Pi: `pi uninstall npm:@juicesharp/rpiv-pi`
2. Open `~/.pi/agent/settings.json` and add `"npm:pi-subagents"` back to the `packages` array so Pi loads nicobailon's subagents directly again.
3. Optional — drop the rpiv-pi seeded keys if you no longer want them:
   - `~/.pi/agent/extensions/subagent/config.json` (parallel.concurrency, maxSubagentDepth)
   - `subagents.disableBuiltins` in `~/.pi/agent/settings.json` (set to `false` or delete to re-enable the 9 bundled nicobailon agents)
4. Restart Pi.

After step 2 you'll have nicobailon's original inline tool card and no Subagents overlay, same as a clean pi-subagents install.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Warning about missing siblings on session start | Sibling plugins not installed | Run `/rpiv-setup` |
| `/rpiv-setup` fails on a package | Network or registry issue | Check connection, retry with `pi install npm:<pkg>`, re-run `/rpiv-setup` |
| `/rpiv-setup` says "requires interactive mode" | Running in headless mode | Install manually: `pi install npm:<pkg>` for each sibling |
| `web_search` or `web_fetch` errors | Brave API key not configured | Run `/web-search-config` or set `BRAVE_SEARCH_API_KEY` |
| `advisor` tool not available after upgrade | Advisor model selection lost | Run `/advisor` to re-select a model |
| Skills hang or serialize agent calls | Agent concurrency too low | Edit `~/.pi/agent/extensions/subagent/config.json` and raise `parallel.concurrency` (default `4`; try `16`–`48` for wide fan-outs) |

## License

MIT
