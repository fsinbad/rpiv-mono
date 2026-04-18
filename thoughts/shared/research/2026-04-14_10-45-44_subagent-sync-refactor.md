---
date: 2026-04-14T10:45:44-0400
researcher: Sergii
git_commit: 5f3e5f8
branch: master
repository: rpiv-pi
topic: "Session-start subagent copy implementation for upcoming add/remove/edit sync refactor"
tags: [research, codebase, rpiv-core, agents-sync, pi-subagents]
status: complete
questions_source: "thoughts/shared/questions/2026-04-14_10-23-03_subagent-sync-refactor.md"
last_updated: 2026-04-14
last_updated_by: Sergii
---

# Research: Session-start subagent copy implementation for upcoming add/remove/edit sync refactor

## Research Question
How should `extensions/rpiv-core` evolve bundled-agent sync to support add/remove/edit detection while preserving startup safety, command UX, and live subagent resolution correctness?

## Summary
Current sync behavior is intentionally split between non-destructive startup (`copyBundledAgents(ctx.cwd, false)`) and explicit destructive refresh (`copyBundledAgents(ctx.cwd, true)`), with all filesystem logic centralized in `extensions/rpiv-core/agents.ts`. The main gap for the upcoming refactor is that sync is existence-based (copy/skip) and source-only; it does not compute destination diffs, content edits, or stale removals. Because `@tintinweb/pi-subagents` reloads custom agents from `.pi/agents` on every `Agent` tool invocation, sync outcomes are runtime-load-bearing immediately. Developer checkpoint decisions: (1) remove only rpiv-managed bundled files, preserving local-only user agents; (2) keep current missing-source posture (silent startup no-op, explicit command warning).

## Detailed Findings

### Session bootstrap and current add-only semantics
- Pi extension discovery comes from `package.json` `pi.extensions` (`package.json:8-10`), loading `extensions/rpiv-core/index.ts` default export (`extensions/rpiv-core/index.ts:36`).
- `session_start` executes multiple side effects in-order, including guidance injection, thoughts scaffolding, git-context injection, bundled-agent sync, and missing-package warnings (`extensions/rpiv-core/index.ts:38-80`).
- Startup sync calls `copyBundledAgents(ctx.cwd, false)` (`extensions/rpiv-core/index.ts:61`), which preserves existing destination files via `if (!overwrite && existsSync(dest))` (`extensions/rpiv-core/agents.ts:53-55`).
- Utility return contract is `{ copied: string[]; skipped: string[] }` (`extensions/rpiv-core/agents.ts:36-40`), and current startup UX only uses `copied.length` (`extensions/rpiv-core/index.ts:62-67`).

### Manual refresh and overwrite boundary
- `/rpiv-update-agents` is registered in `index.ts` and calls `copyBundledAgents(ctx.cwd, true)` (`extensions/rpiv-core/index.ts:123-127`).
- Overwrite mode bypasses skip-on-exists and re-copies bundled files (`extensions/rpiv-core/agents.ts:53-58`).
- Command notification is currently copy-count driven, warning on zero copies and listing refreshed names when non-zero (`extensions/rpiv-core/index.ts:128-133`).
- The correct seam for richer change metadata is `copyBundledAgents` itself (shared by startup and command), preserving orchestration-only `index.ts` per architecture guidance (`.rpiv/guidance/extensions/rpiv-core/architecture.md:73-75`).

### Source-of-truth path resolution and operational posture
- `PACKAGE_ROOT` is derived from `import.meta.url` + `fileURLToPath` + `dirname(dirname(dirname(...)))` (`extensions/rpiv-core/agents.ts:19-23`).
- Bundled source is `BUNDLED_AGENTS_DIR = join(PACKAGE_ROOT, "agents")` (`extensions/rpiv-core/agents.ts:25`), enumerated as `*.md` only (`extensions/rpiv-core/agents.ts:49`).
- Missing bundled source directory returns an empty safe result early (`extensions/rpiv-core/agents.ts:42-44`).
- README contract aligns with local editability and explicit refresh (`README.md:108`, `README.md:146`).

### Refactor-ready code-path proposal for add/remove/edit
- Keep all diff logic in `extensions/rpiv-core/agents.ts` (pure utility, no `ExtensionAPI`) (`extensions/rpiv-core/agents.ts:4`; `.rpiv/guidance/extensions/rpiv-core/architecture.md:74`).
- Add destination enumeration (`readdirSync(targetDir)`) after target-dir creation (`extensions/rpiv-core/agents.ts:46-47`) and build deterministic source/destination filename sets.
- For files present in both sets, compare contents before deciding unchanged vs updated (direct buffer compare is sufficient for current scale).
- Add stale cleanup path for destination-only files (currently absent; no `unlinkSync`/`rmSync` path exists in `agents.ts`).
- Evolve result shape to include `added`, `updated`, `unchanged`, `removed`, `skipped`, while preserving legacy `copied` alias for current callers (`extensions/rpiv-core/index.ts:62-67`, `extensions/rpiv-core/index.ts:128-133`).

### Downstream runtime consumption and resolver risk
- `pi-subagents` reloads custom agents on each `Agent` execution (`/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/index.ts:728`; reload implementation at `:248-250`).
- Custom agent loading scans both global and project directories, with project overlay precedence (`/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/custom-agents.ts:22-27,54`).
- Agent identity key is filename stem (`basename(file, ".md")`) (`/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/custom-agents.ts:43,54-55`), so stale filenames or mistaken deletions have immediate resolution impact.
- Unknown/unresolved subagent types fail open to `general-purpose` (`/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/index.ts:731-733`), which can mask sync regressions unless explicitly tested.

### Intent vs implementation and acceptance alignment
- Migration-era Decision 5 explicitly set startup skip-if-exists + command force-overwrite (`thoughts/shared/designs/2026-04-10_11-18-29_complete-pi-migration.md:118-120`).
- Current implementation still matches that intent (`extensions/rpiv-core/index.ts:61,126`; `extensions/rpiv-core/agents.ts:53-58`; `README.md:108,146`).
- Outdated assumption: existence-only skip is no longer sufficient for add/remove/edit requirements.
- Stable contracts to retain: session-start hook timing, `/rpiv-update-agents` existence, destination path `<cwd>/.pi/agents`, and non-crashing startup behavior.

## Code References
- `package.json:8-10` — Pi extension discovery via `pi.extensions`.
- `extensions/rpiv-core/index.ts:36-80` — extension entry point and `session_start` orchestration.
- `extensions/rpiv-core/index.ts:123-136` — `/rpiv-update-agents` command and UI reporting.
- `extensions/rpiv-core/index.ts:27,61,126` — `copyBundledAgents` import + both call sites.
- `extensions/rpiv-core/agents.ts:19-25` — package-root and bundled-agent source resolution.
- `extensions/rpiv-core/agents.ts:36-59` — copy loop, overwrite gate, return contract.
- `README.md:38-40` — first-session auto-copy behavior.
- `README.md:108,146` — command docs + local agent editability contract.
- `/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/index.ts:248-250` — custom-agent reload routine.
- `/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/index.ts:723-733` — per-call reload + type fallback.
- `/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/custom-agents.ts:22-27,37-55` — global/project scan, parse, filename-stem map identity.
- `/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/agent-types.ts:44-54,59-69` — registry rebuild, override ordering, case-insensitive resolution.

## Integration Points

### Inbound References
- `package.json:8-10` — Pi loads extension tree containing `rpiv-core`.
- `extensions/rpiv-core/index.ts:38-67` — `session_start` triggers automatic sync (non-destructive mode).
- `extensions/rpiv-core/index.ts:123-133` — `/rpiv-update-agents` triggers explicit refresh (overwrite mode).

### Outbound Dependencies
- `extensions/rpiv-core/agents.ts:7` — filesystem dependency surface (`existsSync`, `mkdirSync`, `readdirSync`, `copyFileSync`).
- `extensions/rpiv-core/agents.ts:19-25` — `node:url` + `node:path` based package-root resolution.
- `/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/custom-agents.ts:22-27` — runtime consumer of `.pi/agents` output.

### Infrastructure Wiring
- `extensions/rpiv-core/index.ts:27` — utility wiring boundary (`import { copyBundledAgents }`).
- `extensions/rpiv-core/index.ts:61,126` — shared utility used by startup and command paths.
- `/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/index.ts:728` — reloading wired into every `Agent` execution.
- `/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/custom-agents.ts:43,54-55` — filename-stem registry keying that determines live resolution identity.

## Architecture Insights
- The current design cleanly separates orchestration (`index.ts`) from filesystem sync mechanics (`agents.ts`), which is the correct place to absorb diff semantics.
- Startup hook is cross-cutting; sync refactor must remain fail-soft to avoid blocking guidance/git-context/package-warning flows.
- Resolver behavior is dynamically reloaded and fail-open; acceptance criteria must include runtime resolved-type assertions, not just file-level assertions.
- Backward compatibility is easiest if `copyBundledAgents` keeps `copied` while adding richer categorized arrays.

## Precedents & Lessons
5 similar past changes analyzed. Key commits: `a01a4a3`, `8610ae5`, `74b1cbb`, `317f24e`, `c388ea9`, `31e9cc4`, `d6de433`, `4c6142f`, `887096d`.

- Lifecycle refactors in `session_start` frequently needed fast follow-up fixes for first-turn behavior and idempotence (`74b1cbb` → `317f24e`, `d6de433` → `4c6142f`).
- When runtime contracts changed, docs and setup checks drifted unless updated in the same change (`c388ea9` → `31e9cc4`).
- Agent-sync correctness should be validated at resolver level because fallback-to-`general-purpose` can hide regressions (`887096d` artifact findings + current resolver behavior).

## Historical Context (from thoughts/)
- `thoughts/shared/questions/2026-04-13_15-53-01_agent-resolution-in-plugin.md` — prior discovery of `pi-subagents` resolution and reload mechanics.
- `thoughts/shared/designs/2026-04-10_11-18-29_complete-pi-migration.md` — original migration-era sync design decisions and phase intent.

## Developer Context
**Q (`extensions/rpiv-core/agents.ts:49-57`, `/usr/local/lib/node_modules/@tintinweb/pi-subagents/src/custom-agents.ts:37-54`): Which deletion policy should be canonical for stale files?**  
A: Remove only rpiv-managed bundled files; preserve user-created local-only files.

**Q (`extensions/rpiv-core/agents.ts:42-44`, `extensions/rpiv-core/index.ts:62-67,128-130`): Should missing bundled source stay silent at startup or become warning/error?**  
A: Keep current posture — silent no-op at session start, warning only on explicit `/rpiv-update-agents`.

## Related Research
- Questions source: `thoughts/shared/questions/2026-04-14_10-23-03_subagent-sync-refactor.md`
- Related discovery: `thoughts/shared/questions/2026-04-13_15-53-01_agent-resolution-in-plugin.md`

## Open Questions
- What concrete mechanism should mark an agent file as “rpiv-managed” for safe removals (manifest, embedded marker, or deterministic content fingerprint strategy)?
- Should automatic stale-removal run during `session_start`, or only during `/rpiv-update-agents`, given the new managed-only removal policy?
