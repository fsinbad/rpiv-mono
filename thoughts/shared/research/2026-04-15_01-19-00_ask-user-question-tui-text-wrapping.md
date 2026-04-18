---
date: 2026-04-15T01:18:54+0000
researcher: Sergii
git_commit: 1c5ebfa
branch: main
repository: rpiv-pi
topic: "ask-user-question TUI text wrapping truncation"
tags: [research, codebase, tui, ask-user-question, pi-tui, select-list, truncation]
status: complete
last_updated: 2026-04-15
last_updated_by: Sergii
---

# Research: ask-user-question TUI Text Wrapping Truncation

## Research Question
The ask-user-question dialog truncates (cuts off) long option text instead of wrapping it. Need to identify the root cause and blast area for a fix.

## Summary
The bug has two layers: (1) `ask-user-question.ts` concatenates `label` + `description` into a single string, discarding the `SelectItem.description` field that `SelectList` uses for a two-column layout; (2) `SelectList.renderItem()` uses `truncateToWidth()` for all text — it does not wrap. The fix is scoped to `@juicesharp/rpiv-ask-user-question` only: use `SelectItem.description` properly and render descriptions on separate wrapped lines.

## Detailed Findings

### Root Cause: ask-user-question.ts Concatenation
- `ask-user-question.ts:55-56` — The tool maps options to a single string: `${o.label}${o.description ? ' — ' + o.description : ''}`
- `ask-user-question.ts:59` — Creates `SelectItem` with `{ value: item, label: item }` — **no description field**
- Result: `SelectList` sees no `item.description`, so `renderItem()` always takes the truncation-only fallback path

### Root Cause: SelectList Truncation Behavior
- `select-list.js:130-160` (`renderItem()`) — When `descriptionSingleLine` is undefined (which it always is for ask-user-question):
  - Falls through to `maxWidth = width - prefixWidth - 2` (the "→ " prefix + 2-char safety margin)
  - Calls `truncateToWidth(displayValue, maxWidth, "")` — **truncates with empty ellipsis** (invisible cut-off)
  - Returns a **single string** per item — multi-line items are architecturally unsupported by `SelectList`

### SelectList Two-Column Layout (exists but unused)
- `select-list.js:130-155` — When `descriptionSingleLine` IS provided and `width > 40`:
  - Calculates `primaryColumnWidth` (default 32 chars for label)
  - Renders label + description in two columns
  - But even this path **truncates** the description with `truncateToWidth(descriptionSingleLine, remainingWidth, "")`
  - No wrapping occurs in either path

### Available Wrapping Utility
- `utils.js:531` — `wrapTextWithAnsi(text, width): string[]` — Full word-wrapping utility preserving ANSI codes
- This function is available in `@mariozechner/pi-tui` but NOT used by `SelectList`
- Used by `Text` component, `Markdown` component, `SettingsList` component

### Reference Implementation Comparison
- `examples/extensions/question.ts:163-165` — Shows descriptions on **separate indented lines** with `theme.fg("muted", opt.description)`
- But still uses `truncateToWidth(s, width)` per line — no wrapping even in the reference example
- The reference uses a hand-rolled `render(width)` function, not `SelectList`

### Dialog Container Width
- `interactive-mode.js:1561` — `ui.custom()` renders in `editorContainer` (replaces the editor)
- Full terminal width is passed to `render(width)`
- No overlay constraints — the dialog uses the full width

## Code References
- `/usr/local/lib/node_modules/@juicesharp/rpiv-ask-user-question/ask-user-question.ts:55-59` — Option concatenation + SelectItem creation
- `/usr/local/lib/node_modules/@juicesharp/rpiv-ask-user-question/ask-user-question.ts:67-90` — ui.custom() dialog with SelectList
- `@mariozechner/pi-tui/dist/components/select-list.js:130-160` — renderItem() truncation logic
- `@mariozechner/pi-tui/dist/components/select-list.js:60-80` — render() loop calling renderItem
- `@mariozechner/pi-tui/dist/utils.js:531` — wrapTextWithAnsi() available wrapping utility
- `@mariozechner/pi-tui/dist/utils.js:721` — truncateToWidth() the truncation function causing the bug
- `@mariozechner/pi-coding-agent/examples/extensions/question.ts:163-165` — Reference: description on separate line

## Integration Points

### Inbound References
- 13+ skills in `/Users/sguslystyi/rpiv-pi/skills/` invoke `ask_user_question` via the agent tool call:
  - `skills/design/SKILL.md:140-322` — 6 uses, most impacted (long option descriptions)
  - `skills/research/SKILL.md:128-139` — Pattern conflict resolution questions
  - `skills/outline-test-cases/SKILL.md:135-224` — Outline confirmation
  - `skills/write-test-cases/SKILL.md:177-182` — Usage guidance
  - `skills/discover/SKILL.md:156` — Review questions
  - `skills/implement/SKILL.md:46` — Mismatch resolution
  - `skills/plan/SKILL.md:64` — Phase confirmation
  - `skills/commit/SKILL.md:43` — Commit confirmation
  - `skills/resume-handoff/SKILL.md:104` — Resume confirmation
  - `skills/annotate-guidance/SKILL.md:74,135-140` — Guidance confirmation
  - `skills/annotate-inline/SKILL.md:72,133-138` — Inline confirmation
  - `skills/revise/SKILL.md:107` — Edit confirmation

### Outbound Dependencies
- `@mariozechner/pi-tui` — `SelectList`, `Container`, `Text`, `Spacer`, `DynamicBorder`, `SelectItem`
- `@mariozechner/pi-coding-agent` — `ExtensionAPI`, `DynamicBorder`

### Infrastructure Wiring
- `/usr/local/lib/node_modules/@juicesharp/rpiv-ask-user-question/index.ts` — Extension entry point
- `/usr/local/lib/node_modules/@juicesharp/rpiv-ask-user-question/package.json` — `"pi": { "extensions": ["./index.ts"] }`
- `extensions/rpiv-core/index.ts:91` — `hasRpivAskUserQuestionInstalled()` check
- `extensions/rpiv-core/package-checks.ts:37-38` — Installation detection

## Architecture Insights
- `SelectList` is a **single-line-per-item** component — it renders each item as exactly one line string. Multi-line items require a different rendering approach.
- The proper fix approach: use `SelectItem.description` for the label, and render descriptions separately using `wrapTextWithAnsi()` on indented lines (like the `question.ts` example does, but with wrapping instead of truncation).
- `wrapTextWithAnsi()` preserves ANSI color codes while wrapping — safe to use with themed text.

## Precedents & Lessons
4 relevant changes analyzed across rpiv-pi git history and Pi core.

**Key commits:**
- `8610ae5` — Initial ask-user-question creation using `ctx.ui.select()` (black box, no rendering control)
- `e7e5d20` — Replaced `ctx.ui.select()` with `SelectList` overlay **(bug introduced here — concatenation has persisted since this commit)**
- `c388ea9` — Extracted to standalone `@juicesharp/rpiv-ask-user-question@0.1.0` npm package (bug preserved verbatim)

**Composite lessons:**
- SelectList is fundamentally a **truncation component** — `renderItem()` always calls `truncateToWidth()` with empty ellipsis. It has no wrapping capability and multi-line items break its scroll math. **Do not try to make SelectList wrap — bypass it.**
- The fix must happen in the **external npm package** (`@juicesharp/rpiv-ask-user-question`), then publish a new version (currently 0.1.2) and update rpiv-pi dependency.
- `wrapTextWithAnsi()` from `@mariozechner/pi-tui` preserves ANSI codes while wrapping — safe for themed text. Import directly.
- Tool name `ask_user_question` is a **load-bearing contract** referenced in 30+ skill files — must not be renamed.
- Even Pi's own `question.ts` reference example truncates descriptions — wrapping is breaking new ground in the rpiv ecosystem.
- The `todo-overlay.ts` (`33550c5`) uses truncation + overflow indicators as its overflow strategy, not wrapping.

## Developer Context
**Q (`ask-user-question.ts:55-59`): Should the fix stay in ask-user-question only, modify SelectList in pi-tui, or use a hand-rolled renderer?**
A: Fix in ask-user-question only — use SelectItem.description properly and add custom rendering of long descriptions on wrapped lines. SelectList stays as-is.

## Related Research
- Questions source: standalone query (no discover artifact)

## Open Questions
- None — fix scope decided by developer.
