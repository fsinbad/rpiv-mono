---
date: 2026-04-14T11:28:41-0400
designer: Sergii
git_commit: 5f3e5f8
branch: master
repository: rpiv-pi
topic: "Unify naming conventions across skills, chain emitters, and mirror surfaces with bare-verb pattern"
tags: [design, naming-conventions, skills, pipeline, rename]
status: complete
research_source: "thoughts/shared/research/2026-04-14_10-44-27_naming-conventions-unification-flow.md"
last_updated: 2026-04-14
last_updated_by: Sergii
last_updated_note: "Tightened verify-names.js: first-match-wins classification to prevent duplicate reporting; aligned Desired End State stdout example with actual JSON schema; corrected README line-range labels to 66-69 and 75-78."
---

# Design: Naming Conventions Unification — Pipeline & Skills

## Summary

Rename 6 skills to a bare-verb naming convention (`discover`, `explore`, `plan`, `implement`, `revise`, `validate`) across all identity surfaces — frontmatter, chain emitters, README, and guidance docs. Add a `scripts/verify-names.js` verification script to enforce atomic cutover with no alias period. Agent names and artifact directory names remain unchanged.

## Requirements

- Adopt bare-verb naming for all pipeline and standalone skills where names are inconsistent
- Preserve command ownership boundaries (`/rpiv-*` core vs bare sibling commands)
- Hard cutover — no alias period, no backwards compatibility shims
- All identity surfaces change atomically in one commit
- Provide a verification mechanism to catch stale references before release
- Keep artifact directory names as nouns (orthogonal concern)
- Keep agent names unchanged (already well-structured)

## Current State Analysis

### Key Discoveries

- **Skill naming is already mostly verb-first** (`research`, `design`, `commit`) but 6 skills use verb-noun compounds (`research-questions`, `write-plan`, `implement-plan`, `iterate-plan`, `validate-plan`, `research-solutions`) — this creates inconsistency during manual chaining (`README.md:48-52`)
- **Chain emitters hard-code downstream skill names** as `/skill:<name>` literals in SKILL.md bodies (`skills/research-questions/SKILL.md:220`, `skills/research/SKILL.md:278`, `skills/design/SKILL.md:358`, `skills/write-plan/SKILL.md:188`)
- **"Phase 1/Phase 2" terminology** in descriptions (`skills/research-questions/SKILL.md:3`, `skills/research/SKILL.md:3`) adds cognitive load without structural benefit
- **Mirror surfaces** (README, guidance docs) can drift independently — precedent commits `66eaea3` → `08b230e` and `a02f709` → `5f3e5f8` show follow-up fixes were always needed when mirrors lagged
- **Agent identity is 3-way coupled** (`agents/*.md:2` filename + frontmatter + subagent_type) but agents are well-named and not in scope for this rename
- **No automated tests** exist for skill-name literal consistency — all validation is manual

## Scope

### Building

- Verification script: `scripts/verify-names.js` — grep-based checker for stale old-name literals
- 6 skill folder renames with frontmatter + description + self-reference updates:
  - `research-questions` → `discover`
  - `research-solutions` → `explore`
  - `write-plan` → `plan`
  - `implement-plan` → `implement`
  - `iterate-plan` → `revise`
  - `validate-plan` → `validate`
- Cross-skill chain emitter updates (other skill files referencing renamed skills)
- Mirror surface updates: README.md, `.rpiv/guidance/architecture.md`, `.rpiv/guidance/skills/architecture.md`
- "Phase 1/Phase 2" terminology removal from skill descriptions

### Not Building

- Agent renames — agents follow clear naming tiers (locator/analyzer/scanner/researcher), no change needed
- Artifact directory renames — `thoughts/shared/{questions,research,designs,plans,solutions,handoffs}` stay as nouns
- Runtime TypeScript code changes — `extensions/rpiv-core/index.ts` command registrations (`/rpiv-*`) are unaffected
- Sibling package renames — `@juicesharp/rpiv-*` packages stay as-is
- Alias/deprecation period — hard cutover confirmed by developer
- `outline-test-cases`, `write-test-cases`, `migrate-to-guidance` — developer confirmed preserve

## Decisions

### Canonical Lexicon (Bare Verbs)

Developer chose bare verbs over verb-noun compounds. Full lexicon:

| Current | New | Rationale |
|---|---|---|
| `research-questions` | `discover` | Bare verb; reflects codebase discovery purpose |
| `research` | `research` | Already bare verb |
| `research-solutions` | `explore` | Bare verb; reflects exploring solution alternatives |
| `design` | `design` | Already bare verb |
| `write-plan` | `plan` | Bare verb; creating a plan |
| `implement-plan` | `implement` | Bare verb; executing a plan |
| `iterate-plan` | `revise` | Bare verb; more precise than "iterate" |
| `validate-plan` | `validate` | Bare verb; verifying execution |
| Others | Unchanged | Already bare verb or verb-noun with clear semantics |

### Artifact Directory Naming

Artifact directories (`thoughts/shared/questions/`, `research/`, `designs/`, `plans/`, `solutions/`, `handoffs/`) remain as nouns. They name what is stored, not the action. Evidence: `extensions/rpiv-core/index.ts:43-51` scaffolds these as noun paths consumed by downstream skills as artifact paths, not invocation identifiers.

### Scope: All Skills

Developer chose full unification — rename applies to all 6 skills that need it, not just the main pipeline. Preserved names: `outline-test-cases`, `write-test-cases`, `migrate-to-guidance`.

### Verification Mechanism

Add `scripts/verify-names.js` — grep-based checker that scans all identity surfaces for stale old-name literals and reports mismatches. Modeled after `scripts/migrate.js` pattern (Node.js built-ins only, stdout=JSON, stderr=diagnostics).

### Hard Cutover

No alias period. All surfaces change atomically. Precedent analysis confirms partial renames always required follow-up fixes.

## Architecture

### scripts/verify-names.js — NEW

```js
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

// --- CLI Argument Parsing ---
function parseArgs(argv) {
    let projectDir = process.cwd();
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--project-dir' && argv[i + 1]) {
            projectDir = argv[++i];
        }
    }
    return { projectDir };
}

// --- Rename Map ---
const RENAMES = {
    'research-questions': 'discover',
    'research-solutions': 'explore',
    'write-plan': 'plan',
    'implement-plan': 'implement',
    'iterate-plan': 'revise',
    'validate-plan': 'validate',
};

// Old names that should no longer appear in identity surfaces
const OLD_NAMES = Object.keys(RENAMES);

// Surfaces to check — ordered by specificity. Each match is classified by the
// FIRST pattern it hits; later patterns skip already-claimed offsets so a single
// occurrence is never double-counted.
const OLD_NAMES_ALT = OLD_NAMES.join('|');
const CHECK_PATTERNS = [
    // Skill invocation references — most specific
    { regex: new RegExp(`/skill:(${OLD_NAMES_ALT})(?!\\w)`, 'g'), surface: 'chain-emitter' },
    // Frontmatter name field — anchored to line start
    { regex: new RegExp(`^name:\\s*(${OLD_NAMES_ALT})\\s*$`, 'gm'), surface: 'frontmatter-name' },
    // Bare prose mentions — least specific; runs last
    { regex: new RegExp(`\\b(${OLD_NAMES_ALT})\\b`, 'g'), surface: 'prose-reference' },
];

// Directories to skip
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'thoughts']);

// --- File Discovery ---
function discoverMarkdownFiles(dir) {
    const results = [];
    function walk(d) {
        let entries;
        try { entries = readdirSync(d); } catch { return; }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry)) continue;
            const full = join(d, entry);
            let st;
            try { st = statSync(full); } catch { continue; }
            if (st.isDirectory()) {
                walk(full);
            } else if (entry.endsWith('.md')) {
                results.push(full);
            }
        }
    }
    walk(dir);
    return results;
}

// --- Skill Directory Check ---
function checkSkillDirs(projectDir) {
    const issues = [];
    const skillsDir = join(projectDir, 'skills');
    if (!existsSync(skillsDir)) {
        issues.push({ type: 'missing-dir', path: 'skills/', message: 'skills/ directory not found' });
        return issues;
    }
    // Check old names still exist as directories
    for (const oldName of OLD_NAMES) {
        const oldPath = join(skillsDir, oldName);
        if (existsSync(oldPath)) {
            issues.push({ type: 'stale-dir', path: `skills/${oldName}/`, message: `Old skill directory still exists — should be renamed to skills/${RENAMES[oldName]}/` });
        }
    }
    // Check new names exist
    for (const newName of Object.values(RENAMES)) {
        const newPath = join(skillsDir, newName);
        if (!existsSync(newPath)) {
            issues.push({ type: 'missing-dir', path: `skills/${newName}/`, message: 'New skill directory not found' });
        }
    }
    return issues;
}

// --- Content Check ---
function checkFileContent(filePath, projectDir) {
    const issues = [];
    let content;
    try { content = readFileSync(filePath, 'utf-8'); } catch { return issues; }
    const relPath = relative(projectDir, filePath).split(sep).join('/');
    const lines = content.split('\n');

    // Track claimed [start,end) ranges so a single occurrence is classified once.
    const claimed = [];
    const overlaps = (start, end) => claimed.some(([s, e]) => start < e && end > s);

    for (const pattern of CHECK_PATTERNS) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        let match;
        while ((match = regex.exec(content)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (overlaps(start, end)) continue;
            claimed.push([start, end]);
            const oldName = match[1];
            const lineNum = content.substring(0, start).split('\n').length;
            issues.push({
                type: pattern.surface,
                path: relPath,
                line: lineNum,
                old: oldName,
                expected: RENAMES[oldName],
                context: lines[lineNum - 1]?.trim().substring(0, 120) || '',
            });
        }
    }
    return issues;
}

// --- Main ---
function main() {
    const { projectDir } = parseArgs(process.argv);
    process.stderr.write(`[rpiv:verify-names] scanning ${projectDir}\n`);

    const dirIssues = checkSkillDirs(projectDir);
    const mdFiles = discoverMarkdownFiles(projectDir);
    process.stderr.write(`[rpiv:verify-names] found ${mdFiles.length} markdown files\n`);

    const contentIssues = [];
    for (const file of mdFiles) {
        contentIssues.push(...checkFileContent(file, projectDir));
    }

    const allIssues = [...dirIssues, ...contentIssues];
    const ok = allIssues.length === 0;

    const report = {
        ok,
        total_issues: allIssues.length,
        issues_by_type: {
            'stale-dir': dirIssues.filter(i => i.type === 'stale-dir').length,
            'missing-dir': dirIssues.filter(i => i.type === 'missing-dir').length,
            'frontmatter-name': contentIssues.filter(i => i.type === 'frontmatter-name').length,
            'chain-emitter': contentIssues.filter(i => i.type === 'chain-emitter').length,
            'prose-reference': contentIssues.filter(i => i.type === 'prose-reference').length,
        },
        issues: allIssues,
        renames: RENAMES,
    };

    process.stdout.write(JSON.stringify(report, null, 2));
    process.stderr.write(`[rpiv:verify-names] ${ok ? 'PASS' : 'FAIL'} — ${allIssues.length} issue(s)\n`);
    if (!ok) process.exit(1);
}

main();
```

### skills/discover/SKILL.md — RENAME from skills/research-questions/SKILL.md + MODIFY

```yaml
---
name: discover
description: Generate trace-quality research questions from codebase discovery. Spawns discovery agents and reads key files for depth, then synthesizes into dense question paragraphs for the research skill. Produces question artifacts in thoughts/shared/questions/. First stage of the research pipeline.
argument-hint: [research question or task/ticket description]
---
```

Body changes:
- Line 190: `tags: [research-questions, ...]` → `tags: [discover, ...]`
- Line 220: `` When ready, run `/skill:research thoughts/shared/questions/[filename].md` `` (unchanged — already correct)

### skills/explore/SKILL.md — RENAME from skills/research-solutions/SKILL.md + MODIFY

```yaml
---
name: explore
description: Analyze solution options for features or changes. Compares approaches with pros/cons and provides recommendations. Produces documents in thoughts/shared/solutions/. Use when multiple valid approaches exist.
argument-hint: [feature/change description]
---
```

Body changes:
- Line 234: `Ask if they want to proceed to /skill:design with the chosen option` (unchanged — already correct)

### skills/plan/SKILL.md — RENAME from skills/write-plan/SKILL.md + MODIFY

```yaml
---
name: plan
description: Create phased implementation plans from design artifacts. Decomposes designs into parallelized atomic phases with success criteria in thoughts/shared/plans/. Use after design.
argument-hint: [design artifact path]
---
```

Body changes:
- Line 28: `` `/skill:plan thoughts/shared/designs/2025-01-20_09-30-00_feature.md` ``
- Line 188: `` When ready, run `/skill:implement thoughts/shared/plans/[filename].md Phase 1` ``

### skills/implement/SKILL.md — RENAME from skills/implement-plan/SKILL.md + MODIFY

```yaml
---
name: implement
description: Execute approved implementation plans phase by phase. Implements changes with verification against success criteria. Use when a plan is ready for implementation.
argument-hint: "[plan-path] [Phase N]"
---
```

Body changes: No internal `/skill:` references to update.

### skills/revise/SKILL.md — RENAME from skills/iterate-plan/SKILL.md + MODIFY

```yaml
---
name: revise
description: Update existing implementation plans based on feedback. Makes surgical edits while preserving structure and quality. Use when plans need adjustments after review or during implementation.
argument-hint: "[plan-path] [feedback]"
---
```

Body changes:
- Line 222: `User: /skill:revise thoughts/shared/plans/2025-10-16_09-00-00_feature.md - add phase for error handling`
- Line 228: `User: /skill:revise thoughts/shared/plans/2025-10-16_09-00-00_feature.md`
- Line 236: `User: /skill:revise`

### skills/validate/SKILL.md — RENAME from skills/validate-plan/SKILL.md + MODIFY

```yaml
---
name: validate
description: Verify that an implementation plan was correctly executed. Runs success criteria checks and generates validation reports. Use after implementation is complete.
argument-hint: [plan-path]
---
```

Body changes:
- Line 169: `1. /skill:implement - Execute the implementation`
- Line 171: `3. /skill:validate - Verify implementation correctness`

### skills/research/SKILL.md — MODIFY

```md
# Frontmatter changes:
- Line 3: description: "Answer structured research questions via targeted parallel analysis agents. Consumes question artifacts from discover. Produces research documents in thoughts/shared/research/. Second stage of the research pipeline — always requires a questions artifact."
- Line 4: argument-hint: "[path to discover artifact]"

# Body changes:
- Line 9: "This skill consumes questions artifacts produced by the `discover` skill."
- Line 13: "This skill consumes questions artifacts produced by the `discover` skill."
- Line 29: "This skill requires a questions artifact from discover."
- Line 30: "There is no standalone path — run /skill:discover first to produce a questions artifact."
- Line 291: "- **Analysis only**: This skill answers questions. It does NOT discover what to ask — that's discover's job."
- Line 292: "- **Always chained**: This skill requires a questions artifact from discover. There is no standalone path."
```

### skills/design/SKILL.md — MODIFY

```md
# Frontmatter changes:
- Line 3: description: "... Always requires a research artifact from discover → research, or a solutions artifact from explore."

# Body changes:
- Line 9: "The design artifact feeds directly into plan, which sequences it into phases."
- Line 23: "The final artifact is plan-compatible."
- Line 37: "If a discover artifact is also provided, read it for additional discovery context"
- Line 43: "`/skill:design [research artifact] [discover] [task description]"
- Line 85: "...dimensions that map 1:1 to `plan` extract sections..."
- Line 229: "...write-plan converts these to success criteria." → "plan converts these to success criteria."
- Line 234: "...write-plan ignores this section." → "plan ignores this section."
- Line 258: "...the code must be copy-pasteable by implement."  
- Line 341: "...implement reads it)"
- Line 358: "When ready, run `/skill:plan thoughts/shared/designs/[filename].md` to sequence into phases."
- Line 374: "...copy-pasteable by implement. No pseudocode..."
- Line 378: "...plan can mechanically decompose it into phases."
- Line 404: "...Source file editing is implement's job."
```

### skills/outline-test-cases/SKILL.md — MODIFY

```md
# No changes needed — references to write-test-cases and outline-test-cases are preserved
# (names unchanged by developer decision). All /skill: references already use correct names.
```

### skills/outline-test-cases/templates/outline-readme.md — MODIFY

```md
# No changes needed — references to /skill:write-test-cases and /skill:outline-test-cases
# are preserved (names unchanged by developer decision).
```

### skills/write-test-cases/SKILL.md — MODIFY

```md
# No changes needed — all /skill:write-test-cases references are preserved
# (name unchanged by developer decision).
```

### README.md — MODIFY

```md
# Line 48 (Typical Workflow):
/skill:discover "how does X work"
/skill:research thoughts/shared/questions/<latest>.md
/skill:design thoughts/shared/research/<latest>.md
/skill:plan thoughts/shared/designs/<latest>.md
/skill:implement thoughts/shared/plans/<latest>.md Phase <N>

# Lines 66-69 (Research & Design table rows):
| `discover` | — | `thoughts/shared/questions/` | Generate research questions from codebase discovery |
| `research` | Questions artifact | `thoughts/shared/research/` | Answer questions via parallel analysis agents |
| `explore` | — | `thoughts/shared/solutions/` | Compare solution approaches with pros/cons |
| `design` | Research or solutions artifact | `thoughts/shared/designs/` | Design features via vertical-slice decomposition |

# Lines 75-78 (Implementation table rows):
| `plan` | Design artifact | `thoughts/shared/plans/` | Create phased implementation plans |
| `implement` | Plan artifact | Code changes | Execute plans phase by phase |
| `revise` | Plan artifact | Updated plan | Revise plans based on feedback |
| `validate` | Plan artifact | Validation report | Verify plan execution |
```

### .rpiv/guidance/architecture.md — MODIFY

```md
# Line 19:
Skill pipeline: `discover` → `research` → `design` → `plan` → `implement` → `validate`

# Line 26:
| `/skill:<name>` | Invoke a skill (e.g. `/skill:commit`, `/skill:discover`) |
```

### .rpiv/guidance/skills/architecture.md — MODIFY

```md
# Line 12:
- **Pipeline**: several skills require upstream artifacts — `research` requires `discover` output; `design` requires `research`; `plan` requires `design`; `implement` requires `plan`

# Lines 17-18:
research/, discover/, explore/
design/, plan/, revise/, implement/, validate/

# Line 32:
# disable-model-invocation: true               # rare — implement, create-handoff only
```

## Desired End State

```bash
# Pipeline invocation (bare verbs, no "Phase" terminology):
/skill:discover "how does X work"
/skill:research thoughts/shared/questions/<latest>.md
/skill:design thoughts/shared/research/<latest>.md
/skill:plan thoughts/shared/designs/<latest>.md
/skill:implement thoughts/shared/plans/<latest>.md Phase <N>

# Standalone:
/skill:explore "authentication approach"
/skill:revise thoughts/shared/plans/<latest>.md
/skill:validate thoughts/shared/plans/<latest>.md

# Verification:
node scripts/verify-names.js --project-dir .
# stdout JSON: { "ok": true, "total_issues": 0, "issues_by_type": {...}, "issues": [], "renames": {...} }
# exit code: 0 on pass, 1 on fail
```

## File Map

```
scripts/verify-names.js                                              # NEW — rename consistency checker
skills/discover/SKILL.md                                             # RENAME+MODIFY from research-questions — frontmatter + description + self-refs
skills/explore/SKILL.md                                              # RENAME+MODIFY from research-solutions — frontmatter + description + self-refs
skills/plan/SKILL.md                                                 # RENAME+MODIFY from write-plan — frontmatter + description + self-refs
skills/implement/SKILL.md                                            # RENAME+MODIFY from implement-plan — frontmatter + description + self-refs
skills/revise/SKILL.md                                               # RENAME+MODIFY from iterate-plan — frontmatter + description + self-refs
skills/validate/SKILL.md                                             # RENAME+MODIFY from validate-plan — frontmatter + description + self-refs
skills/research/SKILL.md                                             # MODIFY — chain emitters + description (Phase 2 → research pipeline)
skills/design/SKILL.md                                               # MODIFY — chain emitters + description (research-questions → discover)
skills/outline-test-cases/SKILL.md                                   # MODIFY — chain to write-test-cases preserved
skills/outline-test-cases/templates/outline-readme.md                # MODIFY — /skill: references
skills/write-test-cases/SKILL.md                                     # MODIFY — self-references preserved
README.md                                                            # MODIFY — workflow chain, skill tables, command inventory
.rpiv/guidance/architecture.md                                       # MODIFY — pipeline text, command map
.rpiv/guidance/skills/architecture.md                                # MODIFY — pipeline references, module structure
```

## Ordering Constraints

- Slice 1 (verification script) must come first — provides the rename map used by later slices
- Slice 2 (folder + identity renames) must come before Slice 3 — new names must exist before chain emitters update
- Slice 3 (cross-skill emitters) must come before Slice 4 — mirrors should reference final names
- Slice 4 (mirrors + terminology) is last

## Verification Notes

- Run `node scripts/verify-names.js --project-dir .` after all slices — must report `{ "stale": [], "ok": true }`
- `grep -rn 'research-questions\|research-solutions\|write-plan\|implement-plan\|iterate-plan\|validate-plan' --include='*.md' . | grep -v node_modules | grep -v thoughts/` should return 0 matches on skill/guidance/README surfaces
- `grep -rn 'Phase 1\|Phase 2' --include='*.md' skills/` should return 0 matches in skill frontmatter descriptions
- Visual inspection: README.md workflow example should show `discover → research → design → plan → implement → validate`
- Folder existence check: `ls -d skills/discover skills/explore skills/plan skills/implement skills/revise skills/validate` — all must exist
- Old folder absence check: `ls -d skills/research-questions skills/research-solutions skills/write-plan skills/implement-plan skills/iterate-plan skills/validate-plan` — all must fail

## Performance Considerations

No performance implications. This is a rename-only change with no runtime behavior modification.

## Migration Notes

- Existing `.pi/agents/` copies are unaffected — agent names are not changing
- Users with in-progress `thoughts/` artifacts that reference old skill names in chain emitters will see stale text — acceptable for hard cutover
- No data migration needed — artifact directory names are unchanged

## Pattern References

- `scripts/migrate.js` — pattern for verification script: Node.js built-ins, stdout=JSON, stderr=diagnostics
- `extensions/rpiv-core/index.ts:43-51` — artifact directory scaffolding (stays unchanged)

## Developer Context

**Q (pipeline lexicon):** "Which naming style — bare verbs or verb-noun compounds?"
A: "Bare verbs" — `discover → research → design → plan → implement → validate`

**Q (scope):** "Pipeline only or all skills?"
A: "All skills (full unification)"

**Q (research-solutions rename):** "`research-solutions` does X — which replacement name?"
A: "`explore`" — captures exploring solution alternatives

**Q (preserve names):** "`outline-test-cases`, `write-test-cases`, `migrate-to-guidance` — rename or preserve?"
A: "Preserve"

**Q (verification):** "Verification script or manual grep checks?"
A: "Verification script (`scripts/verify-names.js`)"

## Design History

- Slice 1: Verification script — approved as generated
- Slice 2: Skill folder + identity renames — approved as generated
- Slice 3: Cross-skill chain emitters — approved as generated
- Slice 4: Mirror surfaces + terminology — approved as generated

## References

- Research: `thoughts/shared/research/2026-04-14_10-44-27_naming-conventions-unification-flow.md`
- Questions: `thoughts/shared/questions/2026-04-14_10-19-28_naming-conventions-unification-flow.md`
- Precedent commits: `66eaea3`, `920c276`, `a02f709`, `5f3e5f8` (prior rename migrations with lessons)
