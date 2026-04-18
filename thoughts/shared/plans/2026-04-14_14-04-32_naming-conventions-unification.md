---
date: 2026-04-14T14:04:32-0400
planner: Sergii
git_commit: 6927aa6
branch: master
repository: rpiv-pi
topic: "Unify naming conventions across skills, chain emitters, and mirror surfaces with bare-verb pattern"
tags: [plan, naming-conventions, skills, pipeline, rename]
status: ready
design_source: "thoughts/shared/designs/2026-04-14_11-28-41_naming-conventions-unification.md"
last_updated: 2026-04-14
last_updated_by: Sergii
---

# Naming Conventions Unification Implementation Plan

## Overview

Rename 6 skills to a bare-verb naming convention (`discover`, `explore`, `plan`, `implement`, `revise`, `validate`) across all identity surfaces — frontmatter, chain emitters, README, and guidance docs. Add `scripts/verify-names.js` to enforce atomic cutover. See `thoughts/shared/designs/2026-04-14_11-28-41_naming-conventions-unification.md`.

## Desired End State

```bash
# Pipeline invocation (bare verbs):
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

New skill directories exist: `skills/discover`, `skills/explore`, `skills/plan`, `skills/implement`, `skills/revise`, `skills/validate`. Old directories removed. All `/skill:` chain emitters, README workflow, and guidance docs reference bare-verb names. No `Phase 1/Phase 2` terminology in skill descriptions.

## What We're NOT Doing

- Agent renames — agents follow clear naming tiers (locator/analyzer/scanner/researcher), no change needed
- Artifact directory renames — `thoughts/shared/{questions,research,designs,plans,solutions,handoffs}` stay as nouns
- Runtime TypeScript code changes — `extensions/rpiv-core/index.ts` command registrations (`/rpiv-*`) are unaffected
- Sibling package renames — `@juicesharp/rpiv-*` packages stay as-is
- Alias/deprecation period — hard cutover
- `outline-test-cases`, `write-test-cases`, `migrate-to-guidance` — preserve

## Phase 1: Verification Script

### Overview

Add `scripts/verify-names.js` — a grep-based rename-consistency checker that scans skill directories and markdown identity surfaces for stale old-name literals. Provides the rename map used by later phases and the verification gate after completion.

### Changes Required:

#### 1. Verification script
**File**: `scripts/verify-names.js`
**Changes**: NEW file. Node.js built-ins only. stdout=JSON report, stderr=diagnostics. Exits 1 on any issue.

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

const OLD_NAMES = Object.keys(RENAMES);

const OLD_NAMES_ALT = OLD_NAMES.join('|');
const CHECK_PATTERNS = [
    { regex: new RegExp(`/skill:(${OLD_NAMES_ALT})(?!\\w)`, 'g'), surface: 'chain-emitter' },
    { regex: new RegExp(`^name:\\s*(${OLD_NAMES_ALT})\\s*$`, 'gm'), surface: 'frontmatter-name' },
    { regex: new RegExp(`\\b(${OLD_NAMES_ALT})\\b`, 'g'), surface: 'prose-reference' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'thoughts']);

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

function checkSkillDirs(projectDir) {
    const issues = [];
    const skillsDir = join(projectDir, 'skills');
    if (!existsSync(skillsDir)) {
        issues.push({ type: 'missing-dir', path: 'skills/', message: 'skills/ directory not found' });
        return issues;
    }
    for (const oldName of OLD_NAMES) {
        const oldPath = join(skillsDir, oldName);
        if (existsSync(oldPath)) {
            issues.push({ type: 'stale-dir', path: `skills/${oldName}/`, message: `Old skill directory still exists — should be renamed to skills/${RENAMES[oldName]}/` });
        }
    }
    for (const newName of Object.values(RENAMES)) {
        const newPath = join(skillsDir, newName);
        if (!existsSync(newPath)) {
            issues.push({ type: 'missing-dir', path: `skills/${newName}/`, message: 'New skill directory not found' });
        }
    }
    return issues;
}

function checkFileContent(filePath, projectDir) {
    const issues = [];
    let content;
    try { content = readFileSync(filePath, 'utf-8'); } catch { return issues; }
    const relPath = relative(projectDir, filePath).split(sep).join('/');
    const lines = content.split('\n');

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

### Success Criteria:

#### Automated Verification:
- [x] File exists: `test -f scripts/verify-names.js`
- [x] Script runs: `node scripts/verify-names.js --project-dir . >/dev/null; echo $?` (expect non-zero since old names still present)
- [x] Reports issues: `node scripts/verify-names.js --project-dir . 2>/dev/null | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); process.exit(j.total_issues > 0 ? 0 : 1)"` (expects pre-rename state = issues found)
- [x] JSON schema contains required keys: `ok`, `total_issues`, `issues_by_type`, `issues`, `renames`

#### Manual Verification:
- [x] Run `node scripts/verify-names.js --project-dir .` and confirm stderr shows `[rpiv:verify-names] scanning ...` and `[rpiv:verify-names] found N markdown files`
- [x] Confirm stdout JSON lists old-name occurrences under `issues` with correct `surface` classification (`chain-emitter`, `frontmatter-name`, `prose-reference`, `stale-dir`, `missing-dir`)

---

## Phase 2: Skill Folder + Identity Renames

### Overview

Rename 6 skill directories and update their own frontmatter (`name:`, `description:`), internal `/skill:` self-references, and `tags`. Each rename is a directory move (`git mv`) followed by targeted edits inside the renamed SKILL.md. "Phase 1/Phase 2" terminology removed from descriptions.

### Changes Required:

#### 1. discover skill (from research-questions)
**File**: `skills/discover/SKILL.md` (renamed from `skills/research-questions/SKILL.md`)
**Changes**: Rename directory. Update frontmatter `name: discover`, revised description (no "Phase 1"). Update `tags: [discover, ...]` (line ~190).

```yaml
---
name: discover
description: Generate trace-quality research questions from codebase discovery. Spawns discovery agents and reads key files for depth, then synthesizes into dense question paragraphs for the research skill. Produces question artifacts in thoughts/shared/questions/. First stage of the research pipeline.
argument-hint: [research question or task/ticket description]
---
```

#### 2. explore skill (from research-solutions)
**File**: `skills/explore/SKILL.md` (renamed from `skills/research-solutions/SKILL.md`)
**Changes**: Rename directory. Update frontmatter `name: explore` and description.

```yaml
---
name: explore
description: Analyze solution options for features or changes. Compares approaches with pros/cons and provides recommendations. Produces documents in thoughts/shared/solutions/. Use when multiple valid approaches exist.
argument-hint: [feature/change description]
---
```

#### 3. plan skill (from write-plan)
**File**: `skills/plan/SKILL.md` (renamed from `skills/write-plan/SKILL.md`)
**Changes**: Rename directory. Update frontmatter. Update self-reference on line 28 (invocation example) and line 188 (chain emitter to implement).

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

#### 4. implement skill (from implement-plan)
**File**: `skills/implement/SKILL.md` (renamed from `skills/implement-plan/SKILL.md`)
**Changes**: Rename directory. Update frontmatter only (no internal `/skill:` references to update).

```yaml
---
name: implement
description: Execute approved implementation plans phase by phase. Implements changes with verification against success criteria. Use when a plan is ready for implementation.
argument-hint: "[plan-path] [Phase N]"
---
```

#### 5. revise skill (from iterate-plan)
**File**: `skills/revise/SKILL.md` (renamed from `skills/iterate-plan/SKILL.md`)
**Changes**: Rename directory. Update frontmatter. Update self-references on lines 222, 228, 236.

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

#### 6. validate skill (from validate-plan)
**File**: `skills/validate/SKILL.md` (renamed from `skills/validate-plan/SKILL.md`)
**Changes**: Rename directory. Update frontmatter. Update lines 169 & 171 references.

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

### Success Criteria:

#### Automated Verification:
- [x] New directories exist: `ls -d skills/discover skills/explore skills/plan skills/implement skills/revise skills/validate`
- [x] Old directories removed: `! ls -d skills/research-questions skills/research-solutions skills/write-plan skills/implement-plan skills/iterate-plan skills/validate-plan 2>/dev/null`
- [x] Frontmatter names match directory names: `for d in discover explore plan implement revise validate; do grep -q "^name: $d$" skills/$d/SKILL.md || echo "MISMATCH: $d"; done` (expect no output)
- [x] No `Phase 1`/`Phase 2` in renamed skill descriptions: `grep -En '^description:.*(Phase 1|Phase 2)' skills/{discover,explore,plan,implement,revise,validate}/SKILL.md` returns 0 matches
- [x] No stale self-references in renamed skills: `grep -rn '/skill:\(research-questions\|research-solutions\|write-plan\|implement-plan\|iterate-plan\|validate-plan\)' skills/{discover,explore,plan,implement,revise,validate}/` returns 0 matches

#### Manual Verification:
- [x] Each renamed SKILL.md frontmatter preserves original `argument-hint` semantics
- [x] `tags:` field in `skills/discover/SKILL.md` contains `discover` (not `research-questions`)
- [ ] Git history for renamed files preserved (via `git mv`): `git log --follow skills/discover/SKILL.md` shows history prior to rename

---

## Phase 3: Cross-Skill Chain Emitters

### Overview

Update `skills/research/SKILL.md` and `skills/design/SKILL.md` so their descriptions, prose, and `/skill:` chain emitters reference the new names (`discover`, `plan`, `implement`). These skills point outward at renamed siblings. Test-case skills need no changes (names preserved).

### Changes Required:

#### 1. research skill chain emitters
**File**: `skills/research/SKILL.md`
**Changes**: Description + multiple prose/chain lines updated to reference `discover` instead of `research-questions`. "Phase 2" terminology removed.

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

#### 2. design skill chain emitters
**File**: `skills/design/SKILL.md`
**Changes**: Description references `discover → research` and `explore`. Chain emitter to `plan` updated. Multiple inline references to `write-plan`/`implement-plan` → `plan`/`implement`.

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

#### 3. test-case skill files (NO CHANGES)
**Files**: `skills/outline-test-cases/SKILL.md`, `skills/outline-test-cases/templates/outline-readme.md`, `skills/write-test-cases/SKILL.md`
**Changes**: None — names preserved by developer decision. Phase-3 diff must show these files untouched.

### Success Criteria:

#### Automated Verification:
- [x] No old-name literals in research/design skills: `grep -rn 'research-questions\|research-solutions\|write-plan\|implement-plan\|iterate-plan\|validate-plan' skills/research/ skills/design/` returns 0 matches
- [x] No `/skill:` chain emitters referencing old names across all skills: `grep -rn '/skill:\(research-questions\|research-solutions\|write-plan\|implement-plan\|iterate-plan\|validate-plan\)' skills/` returns 0 matches
- [x] No `Phase 2` in research skill description: `grep -n '^description:.*Phase 2' skills/research/SKILL.md` returns 0 matches
- [x] Test-case skills unchanged: `git diff --stat HEAD skills/outline-test-cases skills/write-test-cases` shows 0 files changed

#### Manual Verification:
- [x] `skills/design/SKILL.md` description reads naturally (discover → research, or explore) without broken grammar
- [x] Chain emitter at end of `skills/design/SKILL.md` points to `/skill:plan` with correct path format

---

## Phase 4: Mirror Surfaces + Terminology

### Overview

Update README.md, `.rpiv/guidance/architecture.md`, and `.rpiv/guidance/skills/architecture.md` to reflect the new bare-verb pipeline. These are the last surfaces to change per the design's Ordering Constraints — they mirror the canonical lexicon.

### Changes Required:

#### 1. README workflow and skill tables
**File**: `README.md`
**Changes**: Update workflow block (line 48), Research & Design skill table rows (lines 66-69), Implementation skill table rows (lines 75-78).

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

#### 2. Root guidance architecture
**File**: `.rpiv/guidance/architecture.md`
**Changes**: Pipeline line 19, command map example line 26.

```md
# Line 19:
Skill pipeline: `discover` → `research` → `design` → `plan` → `implement` → `validate`

# Line 26:
| `/skill:<name>` | Invoke a skill (e.g. `/skill:commit`, `/skill:discover`) |
```

#### 3. Skills guidance architecture
**File**: `.rpiv/guidance/skills/architecture.md`
**Changes**: Pipeline description line 12, module listings lines 17-18, inline comment on disable-model-invocation line 32.

```md
# Line 12:
- **Pipeline**: several skills require upstream artifacts — `research` requires `discover` output; `design` requires `research`; `plan` requires `design`; `implement` requires `plan`

# Lines 17-18:
research/, discover/, explore/
design/, plan/, revise/, implement/, validate/

# Line 32:
# disable-model-invocation: true               # rare — implement, create-handoff only
```

### Success Criteria:

#### Automated Verification:
- [x] No old-name literals in mirror surfaces: `grep -En 'research-questions|research-solutions|write-plan|implement-plan|iterate-plan|validate-plan' README.md .rpiv/guidance/architecture.md .rpiv/guidance/skills/architecture.md` returns 0 matches
- [x] Verification script passes: `node scripts/verify-names.js --project-dir .` exits 0 with `{ "ok": true, "total_issues": 0, ... }`
- [x] Project-wide markdown scan clean: `grep -rn 'research-questions\|research-solutions\|write-plan\|implement-plan\|iterate-plan\|validate-plan' --include='*.md' . | grep -v node_modules | grep -v thoughts/` returns 0 matches
- [x] No `Phase 1`/`Phase 2` in skill descriptions: `grep -rEn '^description:.*(Phase 1|Phase 2)' --include='SKILL.md' skills/` returns 0 matches

#### Manual Verification:
- [x] README.md workflow example renders the full bare-verb pipeline (`discover → research → design → plan → implement → validate`)
- [x] `.rpiv/guidance/skills/architecture.md` module-listing lines read naturally and group renamed siblings together
- [ ] `/rpiv-update-agents` still operates (agents untouched; sanity check that this phase did not accidentally modify `agents/` or runtime extensions)

---

## Testing Strategy

### Automated:
- `node scripts/verify-names.js --project-dir .` — single gate that scans all identity surfaces; must report `{ "ok": true, "total_issues": 0 }` after Phase 4
- `grep -rn '<old-name>' --include='*.md' . | grep -v node_modules | grep -v thoughts/` — redundant manual check across README/skills/guidance
- `ls -d skills/<new>` and `! ls -d skills/<old>` — folder existence / absence checks

### Manual Testing Steps:
1. Open `README.md` and visually confirm the workflow block shows bare verbs end-to-end
2. Open each renamed SKILL.md and confirm frontmatter `name:` matches the folder name
3. Run `/skill:discover` in a Pi session (or equivalent harness) and confirm skill resolves under the new name
4. Run `/skill:plan thoughts/shared/designs/<some-design>.md` and confirm chain emitter at end points to `/skill:implement`
5. Confirm agent invocations from skills (e.g. `discover` spawning `codebase-locator`) still work — no agent names changed

## Performance Considerations

No performance implications. This is a rename-only change with no runtime behavior modification.

## Migration Notes

- Existing `.pi/agents/` copies are unaffected — agent names are not changing
- Users with in-progress `thoughts/` artifacts that reference old skill names in chain emitters will see stale text — acceptable for hard cutover (design decision)
- No data migration needed — artifact directory names are unchanged
- Prefer `git mv` over rm+add for skill folder renames so follow-history is preserved

## References

- Design: `thoughts/shared/designs/2026-04-14_11-28-41_naming-conventions-unification.md`
- Research: `thoughts/shared/research/2026-04-14_10-44-27_naming-conventions-unification-flow.md`
- Questions: `thoughts/shared/questions/2026-04-14_10-19-28_naming-conventions-unification-flow.md`
- Precedent commits: `66eaea3`, `920c276`, `a02f709`, `5f3e5f8`
- Pattern reference: `scripts/migrate.js` (Node built-ins, stdout JSON / stderr diagnostics)
