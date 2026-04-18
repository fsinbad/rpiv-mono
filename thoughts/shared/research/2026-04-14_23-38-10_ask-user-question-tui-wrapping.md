---
date: 2026-04-14T23:38:10+0000
researcher: Claude Code
git_commit: 1c5ebfa
branch: main
repository: rpiv-pi
topic: "ask-user-question extension TUI dialog truncates long option text instead of wrapping"
tags: [research, codebase, ask-user-question, pi-tui, select-list, tui, truncation, rpiv-core]
status: complete
questions_source: "thoughts/shared/questions/2026-04-14_20-45-00_ask-user-question-tui-wrapping.md"
last_updated: 2026-04-14
last_updated_by: Claude Code
---

# Research: ask-user-question TUI dialog truncates long option text

## Research Question
The `ask_user_question` tool's TUI dialog truncates long option labels/descriptions instead of wrapping them. Where does truncation happen, what can be fixed inside the extension alone, and how does a fix reach users?

## Summary
Two independent layers cause the truncation:

1. **Caller flattens+drops description.** `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:52-55` concatenates `${label} — ${description}` into one string, then `ask-user-question.ts:68` constructs `SelectItem` as `{ value: item, label: item }` — `SelectItem.description` is never set. This forfeits the two-column render branch.
2. **`SelectList.renderItem` never wraps.** `select-list.js:90-116` (pi-tui) routes every item through `truncateToWidth(..., "")` — empty ellipsis, silent cut. Two-column path still truncates; single-column fallback truncates with zero visual indicator. `wrapTextWithAnsi` exists at `utils.js:531` but `select-list.js` does not import it.

`SelectList.render(width)` receives the full terminal width (no inset — `DynamicBorder` has no side glyphs), so a description-plumbing fix alone still truncates long labels (≤30 cols) and silently drops descriptions on terminals ≤40 cols (the `width > 40` guard at `select-list.js:93`).

**Fix path chosen:** Replace `SelectList` at `ask-user-question.ts:69-78` with a hand-rolled `ui.custom` component that calls `wrapTextWithAnsi` directly — pixel-perfect to SelectList's two-column visual contract, preserving items-count semantic (up to 10 logical options; dialog grows when labels wrap). No pi-tui change. rpiv-pi side needs zero code changes — version bump + republish + `pi upgrade` is sufficient.

## Detailed Findings

### Caller layer — ask-user-question.ts
- `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:52-55` — `params.options.map((o) => \`${o.label}${o.description ? \` — ${o.description}\` : ""}\`)`. Label and description flattened into one string before the component sees them.
- `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:68` — `selectItems = allItems.map((item) => ({ value: item, label: item }))`. `description` field on `SelectItem` is intentionally not populated.
- `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:69-78` — `new SelectList(selectItems, Math.min(allItems.length, 10), theme)`. Three-arg call; `layout` defaults to `{}`. `getPrimaryColumnBounds()` (`select-list.js:124-131`) then uses `DEFAULT_PRIMARY_COLUMN_WIDTH = 32` as both min and max, pinning the primary column to 32 cols.
- `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:60-84` — `ctx.ui.custom` callback builds `Container + DynamicBorder + Spacer + Text(question) + SelectList + Spacer + Text(hint) + DynamicBorder`. The question `Text` already wraps (via `text.js:55` `wrapTextWithAnsi`); only list items don't.
- `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:109` — return path parses `choice.split(" — ")[0]` to recover the original label, so any client-side wrap-by-splitting would corrupt this.

### SelectList rendering — pi-tui `select-list.js`
- `select-list.js:18-24` — constructor signature `(items, maxVisible, theme, layout = {})`. `this.layout = layout`.
- `select-list.js:36-62` — `render(width)`: computes `primaryColumnWidth`, slices `[startIndex, endIndex)` window, pushes exactly one line per item via `renderItem`, emits scroll indicator.
- `select-list.js:45-46` — `startIndex = max(0, min(selectedIndex - maxVisible/2, filteredItems.length - maxVisible))`; `endIndex = startIndex + maxVisible`. `maxVisible` is an item count, not a row budget.
- `select-list.js:53` — `descriptionSingleLine = normalizeToSingleLine(item.description)` where `normalizeToSingleLine` at `select-list.js:6` is `replace(/[\r\n]+/g, " ").trim()` — newlines in descriptions are destroyed before any render decision.
- `select-list.js:90-116` — `renderItem`. Two-column branch gated at line 93: `if (descriptionSingleLine && width > 40)`.
- `select-list.js:93-108` — two-column branch: `effectivePrimaryColumnWidth = clamp(32, 1, width - prefixWidth - 4)`; `maxPrimaryWidth = effectivePrimaryColumnWidth - 2`; `remainingWidth = width - descriptionStart - 2`; `truncateToWidth(description, remainingWidth, "")` at line 102.
- `select-list.js:110-115` — single-column fallback: `maxWidth = width - prefixWidth - 2`; `truncatePrimary(item, isSelected, maxWidth, maxWidth)`.
- `select-list.js:132-144` — `truncatePrimary`: double-call to `truncateToWidth(..., maxWidth, "")` at lines 142 and 143, both with empty ellipsis.
- `select-list.js:2` — imports only `{ truncateToWidth, visibleWidth }` from `../utils.js`. `wrapTextWithAnsi` is NOT imported here.

### Primitives — pi-tui `utils.js` and `text.js`
- `utils.js:531-548` — `wrapTextWithAnsi(text, width)`: produces multiple lines while preserving ANSI SGR state across breaks (via `AnsiCodeTracker.getActiveCodes`, line 542). Drop-in wrapping primitive.
- `utils.js:721-746` — `truncateToWidth(text, maxWidth, ellipsis)`: ASCII fast path at line 741 does `text.slice(0, targetWidth)`. With `ellipsis = ""` there is no visible cut indicator.
- `text.js:37-86` — `Text.render(width)`: `contentWidth = max(1, width - paddingX*2)`; calls `wrapTextWithAnsi` at line 55; emits one terminal row per wrapped line. Proof that pi-tui already supports multi-line component output — just not inside `SelectList`.
- `settings-list.js:98-101` — `SettingsList` uses `wrapTextWithAnsi` for its description block (a non-grid region) and `truncateToWidth` for grid rows. Existing convention: grid rows single-line, ancillary text wraps.

### Dialog width and container chain
- `tui.js:677, 691` — `TUI.doRender`: `const width = this.terminal.columns; this.render(width);`
- `tui.js:63-68` — `Container.render(width)` forwards unchanged width to children. No inset at any level.
- `interactive-mode.js:1559-1626` — `showExtensionCustom`: non-overlay path places the component into `editorContainer` at `interactive-mode.js:1612-1613`.
- `dynamic-border.js:17-19` — `DynamicBorder.render(width)` emits one line of `"─".repeat(max(1, width))`. No lateral frame glyphs, no columns consumed.
- Net: `SelectList.render(width)` receives `terminal.columns` exactly. On terminals ≤40 cols, the `width > 40` guard at `select-list.js:93` forces single-column fallback no matter what, silently dropping descriptions.

### Fix-path analysis
- **(a) Plumb `description` at line 68.** Engages the two-column branch above `width > 40`, but both branches call `truncateToWidth`. Labels > 30 chars still cut; descriptions > remainingWidth still cut. Below `width > 40`, description is silently dropped. Partial only.
- **(b) Hand-rolled `ui.custom` with `wrapTextWithAnsi`.** Fully solves wrapping; no pi-tui change. Cost: ~80-120 LoC to reimplement scroll window, keyboard nav, selected-row background fill. **Chosen.**
- **(c) Pre-wrap labels → multiple `SelectItem`s.** Breaks `setSelectedIndex` / `onSelect` semantics (fragments become selectable), `setFilter` prefix-match leaks across continuation lines, scroll indicator mis-counts, and `ask-user-question.ts:109` `split(" — ")[0]` recovery breaks. Not viable.
- **(d) Fork pi-tui.** Adding `layout.wrapPrimary` would need budget-aware windowing (`select-list.js:44-61`) — breaking the items-count contract every current consumer relies on (`settings-selector.js:33`, `thinking-selector.js:31`, `theme-selector.js:27`, `show-images-selector.js:22`, `editor.js:1760` autocomplete). Rejected for this pass; revisit if pi-coding-agent needs the same fix.

### Hand-rolled component contract (design constraints from developer)
- **Height budget:** items-count — up to 10 logical options always rendered. Dialog grows when labels wrap (matches `ask-user-question.ts:69` `Math.min(allItems.length, 10)` semantic).
- **Layout:** two-column side-by-side. Left column wraps to the 30-col primary bound (matching `select-list.js:124-131`); right column wraps to remaining width; item height = `max(leftLines, rightLines)`; continuation lines stay within their column.
- **Pixel-perfect parity required:** prefix `"→ "` (2 cols) on selected / `"  "` (2 cols) on unselected; `theme.selectedText` background fills across full row width on *every* row of the selected item (including continuation rows) using `applyBackgroundToLine`-equivalent padding; `theme.description` muted color for all description rows; scroll indicator `(x/n)` at bottom preserved.
- **Filter:** `setFilter` is public on `SelectList` but ask-user-question never invokes it externally, and `SelectList`'s own input handler doesn't wire filter input. Drop from the reimplementation — dead weight.

## Code References
- `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:52-55` — label+description concatenation (bug layer 1)
- `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:68` — `SelectItem.description` dropped
- `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:60-90` — `ctx.ui.custom` overlay body to be replaced
- `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:109` — choice-to-label recovery via `split(" — ")[0]`
- `select-list.js:18-24` — constructor (no layout passed → 32-col pinned primary)
- `select-list.js:44-61` — scroll window assumes items-count
- `select-list.js:90-116` — renderItem two branches (bug layer 2)
- `select-list.js:132-144` — truncatePrimary with empty ellipsis (silent cut)
- `select-list.d.ts:1-25` — `SelectItem`, `SelectListLayoutOptions` public surface
- `utils.js:531-548` — `wrapTextWithAnsi` (the primitive to use)
- `utils.js:721-746` — `truncateToWidth` (what's being used today)
- `text.js:37-86` — reference for wrap + multi-row emit pattern
- `dynamic-border.js:17-19` — confirms zero lateral inset
- `interactive-mode.js:1559-1626` — `showExtensionCustom` placement

## Integration Points

### Inbound References (rpiv-pi side, all version-agnostic)
- `extensions/rpiv-core/package-checks.ts:21-39` — `hasRpivAskUserQuestionInstalled()` regex `/rpiv-ask-user-question/i` matches name only; reads `~/.pi/agent/settings.json` entries which store specs without versions
- `extensions/rpiv-core/index.ts:31` — imports `hasRpivAskUserQuestionInstalled`
- `extensions/rpiv-core/index.ts:91` — session_start missing-sibling aggregator
- `extensions/rpiv-core/index.ts:189-193` — `/rpiv-setup` install spec `npm:@juicesharp/rpiv-ask-user-question` (no version suffix → resolves latest)
- `package.json:31` — peerDep `"@juicesharp/rpiv-ask-user-question": "*"`
- `skills/plan/SKILL.md:64`, `skills/design/SKILL.md:140,142,147,176,206,288,322`, `skills/research/SKILL.md:128,130,139,141`, `skills/revise/SKILL.md:107`, `skills/implement/SKILL.md:46`, `skills/discover/SKILL.md:156`, `skills/write-test-cases/SKILL.md:182`, `skills/outline-test-cases/SKILL.md:140,185,218,224`, `skills/resume-handoff/SKILL.md:104`, `skills/annotate-inline/SKILL.md:72,138`, `skills/annotate-guidance/SKILL.md:74,140`, `skills/commit/SKILL.md:43` — 12 SKILL.md files invoke `ask_user_question`; none constrain option-label length

### Outbound Dependencies (from ask-user-question.ts)
- `@mariozechner/pi` — `ctx.tool`, `ctx.ui.custom`, `SelectList`, `SelectItem`, `Container`, `Text`, `Spacer`, `DynamicBorder` (all re-exported from pi-tui through pi). After the fix, also imports `wrapTextWithAnsi` and `applyBackgroundToLine` (or equivalent) from same.

### Infrastructure Wiring
- `ask-user-question.ts:20-22` — declared as a Pi extension via `package.json` `pi.extensions` entry; auto-loaded on Pi session start
- `extensions/rpiv-core/pi-installer.ts:18-54` — `pi install <pkg>` spawn wrapper used by `/rpiv-setup`; passes spec verbatim, no version suffix

## Architecture Insights
- **pi-tui's convention**: grid components (`SelectList`, `SettingsList` grid rows) truncate; free-form text (`Text`, `SettingsList` description block) wraps. Our hand-rolled component intentionally breaks this convention for ask-user-question because option descriptions are user-facing prose, not table cells.
- **Scroll-window / row-budget coupling**: any wrap-capable list component must choose between items-count (dialog grows) and row-budget (dialog bounded). SelectList's fixed items-count is why the existing 6 consumers can't trivially opt into wrap without upstream rework.
- **`theme.selectedText` as a row-fill decorator**: per `ask-user-question.ts:71` it's `theme.bg("selectedBg", ...)` — painting the selected row's background the full width. Continuation rows of a wrapped selected item must pad to full width before applying the background, or the selection highlight will appear to "short-row" on non-last wrapped lines.
- **DynamicBorder has no sides**: any assumption that a bordered dialog consumes lateral columns is wrong here. `SelectList.render(width)` gets `terminal.columns` exactly.

## Precedents & Lessons
4 similar past changes analyzed. Key commits:
- `c388ea9` — "Extract tools into @juicesharp Pi plugins; bump to 0.4.0" (same-file extraction into sibling npm repo)
- `e7e5d20` — "Replace built-in select with custom overlay in ask-user-question" (where the wrap bug was introduced)
- `daf7ee6` — "Fix /rpiv-setup pi install spawn on Windows; bump 0.4.1" (24h follow-up to 0.4.0)
- `1c5ebfa` — "Bump 0.4.4 (0.4.3 already on registry)" (npm publish collision → dummy bump)

- **Publish-collision pattern is recurrent** — both rpiv-pi (`1c5ebfa`) and rpiv-ask-user-question (`870204e` → `1228139` reused 0.1.2) hit "version already on registry". Before `npm publish`, run `npm view @juicesharp/rpiv-ask-user-question versions` and patch-bump if the target version exists.
- **Every publish triggers 2-4 follow-up patches within 48h** — 0.4.0 → 0.4.1 → 0.4.2 → 0.4.3 → 0.4.4 in rpiv-pi; similar cadence in the sibling. Budget a same-day patch release after shipping the wrap fix.
- **`ask_user_question` is a load-bearing verbatim contract across 12 SKILL.md files.** The extraction plan at `thoughts/shared/plans/2026-04-13_17-52-15_extract-rpiv-plugins.md` explicitly preserved the tool name. The wrap fix must keep tool name + param schema unchanged — every skill prompt shape in-flight works as-is.
- **Windows spawn regressions slip past macOS testing** (`daf7ee6`). The current fix is text/render only, so low Windows risk, but any new ancillary tooling should be tested on Windows.

## Historical Context (from thoughts/)
- `thoughts/shared/research/2026-04-15_01-19-00_ask-user-question-tui-text-wrapping.md` — prior research reaching the same diagnosis; enumerates all 13 call sites and recommends bypassing SelectList rather than extending it
- `thoughts/shared/plans/2026-04-13_17-52-15_extract-rpiv-plugins.md` — plan that extracted `ask-user-question.ts` into the sibling npm package; rationale for verbatim tool-name preservation
- `thoughts/shared/questions/2026-04-14_20-45-00_ask-user-question-tui-wrapping.md` — questions artifact that fed this research

## Developer Context
**Q (`ask-user-question.ts:69-78`): Fix path — plumb description only, hand-rolled `ui.custom` with `wrapTextWithAnsi`, or fork pi-tui upstream?**
A: Hand-rolled `ui.custom` — "pixel perfect" reimplementation required (matches SelectList's current visual contract).

**Q (`ask-user-question.ts:69` `Math.min(allItems.length, 10)`): Items-count (dialog grows) or row-budget (scroll sooner)?**
A: Items-count. Up to 10 logical options always rendered; dialog height grows when labels wrap.

**Q (`select-list.js:93-108` two-column path): Preserve two-column side-by-side or stack label then indented description?**
A: Preserve two-column side-by-side. Left column wraps in 30-col primary bound; right wraps in remaining; item height = `max(leftLines, rightLines)`; continuation lines stay within their column.

## Distribution Plan (ship the fix)
1. Implement the hand-rolled component at `/Users/sguslystyi/rpiv-ask-user-question/ask-user-question.ts:69-78` (replaces the `new SelectList(...)` construction inside `ctx.ui.custom`).
2. Bump `/Users/sguslystyi/rpiv-ask-user-question/package.json:3` from `0.1.2` → `0.1.3`. **First** run `npm view @juicesharp/rpiv-ask-user-question versions` to verify 0.1.3 isn't already taken.
3. `npm publish` (publishConfig `access: public` at `package.json:17-19`).
4. Client upgrade: `pi upgrade` or re-run `/rpiv-setup` (no lockfile under `~/.pi` pins version — `~/.pi/agent/settings.json` stores names only).
5. Restart Pi session (extensions load at boot — `extensions/rpiv-core/index.ts:269-272` already prompts this).
6. **No rpiv-pi changes required** — regex at `package-checks.ts:37-39` matches name only; peerDep is `"*"`; no SKILL.md prompt depends on truncation behavior.

## Related Research
- Questions source: `thoughts/shared/questions/2026-04-14_20-45-00_ask-user-question-tui-wrapping.md`
- `thoughts/shared/research/2026-04-15_01-19-00_ask-user-question-tui-text-wrapping.md` — prior independent investigation (same diagnosis)

## Open Questions
- **Narrow-terminal policy.** Below what width (e.g., 30? 24?) should the hand-rolled two-column layout collapse to stacked (label-then-indented-description) or label-only? Current `SelectList` uses `width > 40` for two-column gating and `remainingWidth > MIN_DESCRIPTION_WIDTH = 10` for the description column — mirror these as thresholds, or pick new ones that suit wrapping?
- **Continuation-row gutter alignment.** Continuation lines of the label column should indent to `prefixWidth = 2` (align under the label's first char). Confirm during implementation that the selected-row background fill pads across the full terminal width on continuation rows (i.e., reuse a `applyBackgroundToLine`-style helper from `utils.js`).
