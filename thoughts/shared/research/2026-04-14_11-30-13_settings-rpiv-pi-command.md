---
date: 2026-04-14T11:30:13-0400
researcher: Claude Code
git_commit: df500d6
branch: master
repository: rpiv-pi
topic: "Add /settings-rpiv-pi command to configure runtime values (e.g. display: true|false in index.ts) without editing source"
tags: [research, codebase, rpiv-core, settings, config, slash-command, ctx-ui, persistence]
status: complete
questions_source: "thoughts/shared/questions/2026-04-14_10-01-07_settings-rpiv-pi-command.md"
last_updated: 2026-04-14
last_updated_by: Claude Code
---

# Research: `/settings-rpiv-pi` Command

## Research Question
Add a `/settings-rpiv-pi` slash command that configures runtime values (e.g. the `display: true|false` flag on injected messages in `index.ts`) without editing source. Decide: what to expose in v1, where the config lives, how the command is rendered, how cache invalidation propagates, and how headless mode behaves.

## Summary

v1 ships **two namespace-scoped toggles** (`showGitContext`, `showGuidance`) that gate the five `display: false` sites — three `rpiv-git-context` sends at `index.ts:57,94,118` and two `rpiv-guidance` sends at `guidance.ts:150,190`. These two `customType` namespaces map 1:1 to the two toggles.

Config lives at **`~/.config/rpiv-pi/settings.json`**, user-scope, single layer, `chmod 0o600`. Post-extraction of `advisor.ts` and `web-tools/index.ts`, that directory is empty and owned by rpiv-core. The persistence pattern is copied symmetrically from the extracted-but-documented `loadConfig`/`saveConfig` shape in `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md:433-459`.

Command shape: first `ctx.ui.custom<T>` site in the repo. An overlay-mode `SettingsList` from `@mariozechner/pi-tui` provides the live label+cycling-value UX. A headless args fallback (`--show`, `key=value`) handles print-mode (`pi -p`), because `ctx.ui.notify` is a silent no-op when `hasUI === false` (`runner.js:60`).

Cache invalidation for `display` toggles is **zero work** — the flag is per-send, not cached. Writing the settings file is sufficient; the next `sendMessage` reads the new value if the handler re-reads config inline. Other candidate settings (guidance tool filter, git timeout) would require clearing specific caches, but those are deferred to v2.

Since `display`/`showX` toggles are stateless, the handler does not need to synthesize a `session_compact`. The only required side effect on save is the `writeFileSync` itself.

## Detailed Findings

### Display-toggle surface (Question 1)

Two `customType` namespaces, five sites:

**`customType: "rpiv-git-context"` (short branch/commit/user block)**
- `index.ts:57` — `session_start`, after `takeGitContextIfChanged(pi)` returns non-null at `:55`.
- `index.ts:94` — `session_compact`, after `resetInjectedMarker()` at `:90`.
- `index.ts:117-119` — `before_agent_start` returning `BeforeAgentStartEventResult.message`. Same shape, different delivery (return value, not `pi.sendMessage`).

Content producer: `takeGitContextIfChanged` at `git-context.ts:68-75`. Fixed format at `git-context.ts:74`: `"## Git Context\n- Branch: …\n- Commit: …\n- User: …"`.

**`customType: "rpiv-guidance"` (multi-file markdown bundles)**
- `guidance.ts:147-151` — `injectRootGuidance`, `session_start` root `.rpiv/guidance/architecture.md`.
- `guidance.ts:187-191` — `handleToolCallGuidance`, depth-walked stack joined by `\n\n---\n\n`.

Content producer: `handleToolCallGuidance` at `guidance.ts:162-192`. Gated by tool filter `["read","edit","write"]` at `guidance.ts:167`.

`display: false` keeps content in the transcript context (the model still sees it) but suppresses TUI visual rendering. Flipping to `true` would render git-context cards on every session start/compact, architecture.md bodies on every root-guidance inject, and multi-KB stacked guidance blocks on every read/edit/write across subdirs.

### Persistence location (Question 2)

Current state: `rpiv-pi@0.4.0` has **zero persistence**. `loadConfig`/`saveConfig` grep returns no matches. `extensions/web-tools/` was deleted in `c388ea9`. `advisor.ts` was also extracted. `PACKAGE_ROOT` at `agents.ts:19-23` is read-only (source asset). `PI_AGENT_SETTINGS = ~/.pi/agent/settings.json` at `package-checks.ts:15` is Pi-owned and read-only from rpiv-pi.

The "contradiction" between advisor research (`~/.config/rpiv-pi/advisor.json`) and extract-plugins design (`~/.config/rpiv-advisor/advisor.json`) resolves to the rule: **each package persists under `~/.config/<package-name>/`**. rpiv-core is the only code left in `@juicesharp/rpiv-pi`, so `~/.config/rpiv-pi/` belongs to it.

Chosen path: **`~/.config/rpiv-pi/settings.json`**. Not `<cwd>/.rpiv/settings.json` — every v1 knob is a user UI preference, not a repo policy. Not layered — YAGNI, siblings chose flat global.

Pattern to copy from `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md:433-459`:
- `loadConfig`: `existsSync` guard → `readFileSync` + `JSON.parse` inside `try/catch` → `{}` on failure. Never throws.
- `saveConfig`: `mkdirSync(dirname, { recursive: true })` + `writeFileSync(..., JSON.stringify(config, null, 2) + "\n", "utf-8")` + `chmodSync(..., 0o600)`, **each wrapped in its own try/catch**.

### Command shape and module layout (Question 3)

`/rpiv-setup` at `index.ts:140-241` is the local template: inline registration, `ctx.hasUI` guard at `:143-146`, single `ctx.ui.confirm` at `:197`, `ctx.ui.notify` for progress and summary. It is a **one-shot, linear, dismiss-after-action** command.

`/settings-rpiv-pi` diverges: users want to toggle multiple fields and review them together. A sequential-dialog approach works but closes the overlay between each field (`interactive-mode.js:1486-1498`), breaking the "review side-by-side" mental model. `ctx.ui.custom<T>` (`types.d.ts:93-103`) stays open until the factory's component calls `done(result)`.

Module split per the architecture rule at `.rpiv/guidance/extensions/rpiv-core/architecture.md:86-92` ("Complex handler: create `my-command.ts`"):

- `extensions/rpiv-core/settings-store.ts` — pure, no `ExtensionAPI`. Exports `loadSettings()`, `saveSettings()`, types, defaults. Mirrors `package-checks.ts` / `agents.ts` posture.
- `extensions/rpiv-core/settings.ts` — exports `registerSettingsCommand(pi: ExtensionAPI): void`. Imports `ExtensionAPI` (allowed for side-effecting registrars, see `guidance.ts` which does the same at `:24, :122`).
- `extensions/rpiv-core/index.ts` — add `registerSettingsCommand(pi)` alongside existing `pi.registerCommand` sites.

The utility-module rule at `guidance.ts:14-19` forbids `ExtensionAPI` in **pure** helpers (like `resolveGuidance`), not in registration-side-effect modules.

### Rendering via `ctx.ui.custom<T>` + pi-tui (Question 4)

Zero prior art in this repo — `Grep` confirms `ctx.ui.*` usage is only `notify` (9 sites) + `confirm` (1 site at `index.ts:197`). This command introduces the first `ctx.ui.custom` call.

Runtime lifecycle (from `interactive-mode.js:1476-1542`, `showExtensionCustom`):
- `done` callback IS the overlay-close function (`:1489-1505`). Calling `done(result)` tears down the overlay AND resolves the Promise.
- `options.overlay` defaults to `false` (inline, replaces editor). Set to **`true`** for modal floating panel via `TUI.showOverlay` (`tui.d.ts:167-170`).
- Factory receives `(tui, theme, keybindings, done)` (`:1506`).

Component tree for the panel:
- `Container` (pi-tui `tui.d.ts:123-130`) wraps children; `handleInput` must forward to the focused child.
- **`SettingsList`** from `@mariozechner/pi-tui/dist/components/settings-list.d.ts:26-49` is the purpose-built primitive for label+cycling-value rows. Enter/Space cycles through `values` and fires `onChange(id, newValue)` without re-opening the panel. Reference impl: Pi's own `SettingsSelectorComponent` at `.../settings-selector.js:60-80`.
- `Text`, `Spacer` wrap header/footer lines.

```ts
new SettingsList(
  items: [
    { id: "showGitContext", label: "Show git context", currentValue: String(cfg.showGitContext), values: ["true", "false"] },
    { id: "showGuidance",   label: "Show guidance",    currentValue: String(cfg.showGuidance),   values: ["true", "false"] },
  ],
  maxVisible: 10,
  theme: getSettingsListTheme(theme),
  onChange: (id, val) => { draft[id] = (val === "true"); saveSettings(draft); },
  onCancel: () => done({ changed: false }),
)
```

### Cache invalidation (Question 5)

Three state shards in the extension:
1. `injectedGuidance` Set at `guidance.ts:104` — cleared by `clearInjectionState()` at `:106-108`.
2. `cache` + `lastInjectedSig` pair at `git-context.ts:17-20` — cleared by `clearGitContextCache()` at `:28-30` and `resetInjectedMarker()` at `:61-63`.
3. Session hooks (no re-registration API) at `index.ts:38,87,99,106,114`. Settings must be read **inside** the handler each invocation, not at registration.

Decision table for each potential setting:

| Setting | Cache to clear | Re-trigger | Session restart? |
|---|---|---|---|
| `showGitContext` / `showGuidance` (v1) | **None** — `display` is per-send | Next send reads new value | No |
| Guidance tool filter | `clearInjectionState()` | Next `tool_call` re-resolves | No (partial retroactivity) |
| Git timeout | `clearGitContextCache()` | Next cache-miss re-reads | No |
| Thoughts scaffold list | None (filesystem side effect) | Deferred — `mkdirSync` is one-shot | Effective next session_start |

**For v1 (`display` toggles only): no invalidation needed. Just write the JSON.**

For shape-affecting toggles, the handler would synthesize a mini-`session_compact` equivalent to `index.ts:87-96`. But gate on "did a shape-affecting setting change" — otherwise calling `injectRootGuidance` on a `display` toggle causes duplicate root-guidance injection.

### Scope and schema (Question 6)

Ranked v1 cut (from the 10 candidates surfaced by the locator):

| Candidate | Read site | v1? | Reason |
|---|---|---|---|
| `display` on 5 sites | `index.ts:57,94,118` + `guidance.ts:150,190` | **v1** | User's canonical example |
| `notifyLevel` | 9 `ctx.ui.notify` sites | v2 | High value, deferred per checkpoint |
| Guidance tool filter | `guidance.ts:167` | v2 | Power-user knob |
| Git timeout 5000ms | `git-context.ts:36,37,45` | v2 | Latency tuning |
| `thoughts/shared` base | `index.ts:43-49` | v2+ | Cross-plugin coupling |
| `.rpiv/guidance/architecture.md` path | `guidance.ts:77,123` | v2+ | Baked into `scripts/migrate.js` |
| Install timeout 120_000 | `index.ts:208` | v3 | Only hit during `/rpiv-setup` |
| `copyBundledAgents` overwrite | `index.ts:61` | — | Already in `/rpiv-update-agents` |
| Migrate exclusion list | `scripts/migrate.js:27-30` | — | Belongs in CLI flag, not runtime config |
| `.pi/agents` target | `agents.ts:46` | — | Pi-platform convention |

Schema: two booleans in v1, inline in `settings-store.ts`. Typebox schemas remain the convention for `pi.registerTool` params; a settings object this small doesn't need one. If v2 expands the schema, a `settings-schema.ts` using `Type.Object` would be the natural extension.

### Headless / args discipline (Question 7)

`RegisteredCommand.handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>` (`types.d.ts:691`). Dispatch at `agent-session.js:781-794`:
- `text.indexOf(" ")` is the split; args is **raw, untokenized, untrimmed** suffix.
- Defensive handlers should `args.trim()` first, then split on `/\s+/`.
- `/settings-rpiv-pi` with no args → `args === ""`.

`ctx.hasUI` semantics (`runner.js:56-83, 197-205`):
- Interactive TUI: `hasUI === true`, `notify` renders inline.
- RPC mode: `hasUI === true`, `notify` writes a JSON-RPC `extension_ui_request`.
- **Print mode (`pi -p`)**: never calls `setUIContext`; `hasUI === false`; `ctx.ui.notify` is a silent no-op (`runner.js:60`).

To make a read-mode visible in print-mode, the handler must write directly to `process.stdout` / `process.stderr`. `console.log` in TUI mode corrupts rendering; guard with `ctx.hasUI`:

```ts
if (ctx.hasUI) ctx.ui.notify(msg, "info");
else process.stdout.write(msg + "\n");
```

SDK precedent: `runner.js:253-257` itself falls back to `console.warn` only when `!hasUI()`.

Sibling `rpiv-web-tools/index.ts:460` uses `args.includes("--show")` — no quote-aware parsing. Ad-hoc substring matching is the established convention.

V1 args surface:
- `/settings-rpiv-pi` with no args in interactive mode → open custom panel.
- `/settings-rpiv-pi --show` → dump current resolved config via `notify` (UI) or `process.stdout` (print).
- `/settings-rpiv-pi showGitContext=false` → validate, persist, report same way.

## Code References

### Display-toggle sites (v1 target)
- `extensions/rpiv-core/index.ts:55-58` — session_start git-context sendMessage
- `extensions/rpiv-core/index.ts:87-96` — session_compact clear+re-inject (template for mini-compact synthesis)
- `extensions/rpiv-core/index.ts:114-120` — before_agent_start message return
- `extensions/rpiv-core/guidance.ts:147-151` — injectRootGuidance sendMessage
- `extensions/rpiv-core/guidance.ts:187-191` — handleToolCallGuidance sendMessage

### Content producers
- `extensions/rpiv-core/git-context.ts:68-75` — `takeGitContextIfChanged`
- `extensions/rpiv-core/guidance.ts:162-192` — `handleToolCallGuidance`

### State shards
- `extensions/rpiv-core/guidance.ts:104` — `injectedGuidance` Set
- `extensions/rpiv-core/guidance.ts:106-108` — `clearInjectionState`
- `extensions/rpiv-core/guidance.ts:122-152` — `injectRootGuidance`
- `extensions/rpiv-core/git-context.ts:17-20` — `cache` + `lastInjectedSig`
- `extensions/rpiv-core/git-context.ts:28-30` — `clearGitContextCache`
- `extensions/rpiv-core/git-context.ts:61-63` — `resetInjectedMarker`

### Command template
- `extensions/rpiv-core/index.ts:140-241` — `/rpiv-setup` command (inline, `ctx.hasUI` guard at `:143`, `ctx.ui.confirm` at `:197`)
- `extensions/rpiv-core/index.ts:123-137` — `/rpiv-update-agents` (shorter inline template)

### Boundary / layout
- `extensions/rpiv-core/agents.ts:19-25` — `PACKAGE_ROOT` (read-only source asset)
- `extensions/rpiv-core/package-checks.ts:15,21-31` — `PI_AGENT_SETTINGS` (read-only Pi-owned)
- `.gitignore:3` — `.rpiv/` ignored
- `package.json:2-3,18-21` — `@juicesharp/rpiv-pi@0.4.0` post-extraction

### External SDK references
- `node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:55-164` — `ExtensionUIContext`
- `types.d.ts:93-103` — `ctx.ui.custom<T>` signature
- `types.d.ts:180-209, 214-243, 686-692` — `ExtensionContext` / `ExtensionCommandContext` / `RegisteredCommand`
- `runner.js:56-83, 197-205` — `noOpUIContext`, `hasUI` semantics
- `agent-session.js:781-805` — slash-command dispatch + parsing
- `interactive-mode.js:1476-1542` — `showExtensionCustom` overlay lifecycle
- `@mariozechner/pi-tui/dist/components/settings-list.d.ts:2-49` — `SettingsList` primitive
- `pi-tui/dist/tui.d.ts:75-130, 167-170` — `OverlayOptions`, `Container`, `showOverlay`

## Integration Points

### Inbound References
- `extensions/rpiv-core/index.ts:36` (default export) — Pi extension host calls this at session start; where `registerSettingsCommand(pi)` will be added.
- `package.json` `"extensions": ["./extensions"]` — Pi's extension discovery.

### Outbound Dependencies
- `~/.config/rpiv-pi/settings.json` — new user-scope JSON file (written by `saveSettings`, read by `loadSettings`).
- `@mariozechner/pi-tui` — `Container`, `SettingsList`, `Text`, `Spacer` (peer dep already declared).
- `@mariozechner/pi-coding-agent` — `ExtensionAPI.registerCommand`, `ctx.ui.custom<T>`, `ctx.hasUI`.

### Infrastructure Wiring
- `extensions/rpiv-core/index.ts` — add `registerSettingsCommand(pi)` call alongside existing command registrations.
- No session-hook changes needed for v1 (display toggles are stateless).
- The `display: false` sites at the five references above must be updated to read the toggle: `display: !cfg.showGitContext` / `display: !cfg.showGuidance`. Handler must re-load config on each call (or the runtime must subscribe to writes).

## Architecture Insights

- **Two-namespace partition is architecturally pre-existing.** The code already splits by `customType` (`rpiv-git-context` vs `rpiv-guidance`) and by module (`git-context.ts` vs `guidance.ts`). The v1 toggle axis matches.
- **Producers must run even when rendering is silenced.** Gating `display` does not skip calling `takeGitContextIfChanged` (which updates `lastInjectedSig` at `git-context.ts:73`) or `handleToolCallGuidance` (which updates the `injectedGuidance` Set at `guidance.ts:180`). Producers keep state coherent; the toggle only affects the `sendMessage` call downstream.
- **Complex commands get their own module; utility modules stay pi-free.** `guidance.ts:14-19` explicitly limits the no-`pi` rule to pure helpers (`resolveGuidance`). Registration-side-effect functions (`injectRootGuidance`) import `ExtensionAPI` freely. `settings.ts` follows the same split: pure `settings-store.ts` + side-effecting `settings.ts`.
- **Persistence convention is "one `~/.config/<package-name>/` per package."** Advisor and web-tools both chose global flat files with `chmod 0o600`; rpiv-core follows.
- **Print mode is mute.** Every `ctx.ui.*` call is a no-op. Any scripted use requires `process.stdout` / `process.stderr` gated by `!ctx.hasUI`.

## Precedents & Lessons

5 similar past changes analyzed. Key commits: `bb7e30f` (advisor persistence, now extracted), `c388ea9` (extraction to siblings), `a01a4a3` (web-tools template, now extracted), `df500d6` (git-context consolidation regression), `33825e2` (saveConfig symmetry fix).

- **Asymmetric load/save error handling is the #1 trap.** `bb7e30f` shipped `loadAdvisorConfig` wrapped in try/catch but `saveAdvisorConfig` bare; `33825e2` fixed it 3 hours later. Wrap `mkdirSync`+`writeFileSync` AND `chmodSync` in **separate** try/catch blocks from the first commit.
- **`chmod 0o600` is the convention** for `~/.config/rpiv-pi/*.json`, even for non-sensitive data. Always in its own try/catch — some filesystems reject mode bits.
- **SelectList indices break when items shift.** `b50fd50` added an "off" item and broke `indexOf(...) + 1` math. Always use `findIndex(item => item.value === target)`. `SettingsList` avoids this by taking a `currentValue` string, not an index.
- **Consolidation optimizations silently regress semantics.** `df500d6` reverted a single-call `git rev-parse --abbrev-ref --short` because `--abbrev-ref` mode persisted to the second rev. Prefer explicit/symmetric over clever.
- **`display: false` on injected messages has never been flipped and reverted.** The hidden-injection convention is stable. User-visible messaging always uses `ctx.ui.notify`.

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-04-12_11-57-02_advisor-settings-persistence.md` — established `~/.config/rpiv-pi/<plugin>.json` convention and `loadConfig`/`saveConfig` pattern (chosen when advisor lived in rpiv-pi).
- `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md` — extraction design that moved siblings out; reproduces the persistence pattern at `:433-459` (advisor) and `:2176-2191` (web-tools).
- `thoughts/shared/plans/2026-04-12_12-59-39_advisor-settings-persistence.md` — advisor persistence plan; shipped asymmetric save error handling that needed a fix commit.
- `thoughts/shared/plans/2026-04-13_17-52-15_extract-rpiv-plugins.md` — extraction plan.
- `thoughts/shared/questions/2026-04-14_10-01-07_settings-rpiv-pi-command.md` — source questions artifact for this research.

## Developer Context

**Q: Which high-value settings should v1 expose? (Grounded in the 5 `display: false` sites at `index.ts:57,94,118` + `guidance.ts:150,190` plus the other 9 candidates Q6 surfaced.)**
A: v1 ships **`showGitContext` + `showGuidance` only**. `notifyLevel`, `guidanceToolFilter`, `gitContextTimeoutMs`, and `thoughtsScaffoldDirs` deferred to v2.

**Q: Which persistence scope and UI shape? (Grounded in `~/.config/rpiv-pi/` being empty post-extraction per `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md`, and zero existing `ctx.ui.custom` sites in the repo.)**
A: **Global config at `~/.config/rpiv-pi/settings.json`** + `ctx.ui.custom<T>` panel for interactive use + args fallback (`--show`, `key=value`) for `pi -p` print-mode. Covers scripted use since `ctx.ui.notify` is silent in print-mode (`runner.js:60`).

**Q: Any lower-priority settings for v1? (`copyBundledAgentsOnStart` at `index.ts:61`, `installTimeoutMs` at `index.ts:208`, `thoughtsScaffoldDirs` at `index.ts:43-49`.)**
A: **None** — defer all to v2. Keep v1 minimal.

## Related Research
- Questions source: `thoughts/shared/questions/2026-04-14_10-01-07_settings-rpiv-pi-command.md`
- Prior persistence research: `thoughts/shared/research/2026-04-12_11-57-02_advisor-settings-persistence.md`
- Extraction design: `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md`

## Open Questions

1. Config file hot-reload vs restart. Should the command re-read `settings.json` on every injection site (`index.ts:57,94,118`, `guidance.ts:150,190`), or cache in-memory and require a `/settings-rpiv-pi` save to mutate the in-process copy? For v1 (stateless `display` toggles), either works; per-call `loadSettings()` is ~sub-ms overhead with `{}` fallback on missing file.
2. Args validation strictness. On `/settings-rpiv-pi invalidKey=foo`, should the handler reject, warn-and-skip, or silently ignore? No sibling precedent exists for key validation.
3. Future v2 ergonomics. If `guidanceToolFilter` and `gitContextTimeoutMs` arrive in v2, does the schema stay inline or move to `settings-schema.ts` with Typebox? Not blocking v1.
