---
date: 2026-04-18T10:15:00-0400
designer: Claude Code
git_commit: ea7adc063a794e99d1cb0387b9a174e320d7b3d9
branch: main
repository: rpiv-pi
topic: "Consolidate rpiv-pi and siblings into juicesharp/rpiv-mono monorepo"
tags: [design, monorepo, workspaces, rpiv-pi, siblings, pi-mono, release-pipeline, lockstep, phase-1]
status: complete
research_source: thoughts/shared/research/2026-04-18_09-23-09_rpiv-monorepo-consolidation.md
last_updated: 2026-04-18
last_updated_by: Claude Code
---

# Design: rpiv-mono Monorepo Consolidation (Phase 1)

## Summary

Fresh-init a new `juicesharp/rpiv-mono` GitHub repo with a flat `packages/*` layout holding today's 6 Pi plugins verbatim (rpiv-pi + 5 siblings). Adopt pi-mono's `scripts/release.mjs` + `scripts/sync-versions.js` for a local-only lockstep publish pipeline, adapted to drop build/clean steps (Pi loads raw TypeScript). Phase 1 is mechanical-only: zero runtime behavior change, zero cross-package `dependencies` edges introduced.

## Requirements

- Preserve customers' ability to install and update each published sibling independently (each `@juicesharp/rpiv-*` remains on npm with an unchanged package name).
- Zero behavior change at runtime: `SIBLINGS` registry, `peerDependencies:"*"`, `~/.pi/agent/settings.json` detection, and `PACKAGE_ROOT` resolution all work byte-identically.
- Publish pipeline modeled after `badlogic/pi-mono`: single command to release all packages in lockstep.
- Plan for future shared-package `dependencies` edges (Phase 2 `rpiv-core` extraction, Phase 3 test-skills extraction) via caret-range protocol — `sync-versions.js` rewrites on publish.
- rpiv-pi's `## [Unreleased]` CHANGELOG pattern survives; release.mjs promotes it verbatim.
- Source repos remain live with a README pointer to rpiv-mono; issues/PRs disabled after first monorepo publish.

## Current State Analysis

Six standalone GitHub repos under `juicesharp/`, locally at `/Users/sguslystyi/rpiv-{pi,advisor,ask-user-question,btw,todo,web-tools}/`. Versions diverged: rpiv-pi@0.6.0, others at 0.1.x.

### Key Discoveries

- **Runtime coupling is zero** — no sibling `import`s another. Cross-package binding is declarative only: `SIBLINGS` registry at `extensions/rpiv-core/siblings.ts:22-53` + `peerDependencies:"*"` at `rpiv-pi/package.json:25-33`. Detection is filesystem-based via regex over `~/.pi/agent/settings.json` (`package-checks.ts:11`). Monorepo layout is invisible to this path.
- **`PACKAGE_ROOT` three-dirname walk survives** — `extensions/rpiv-core/agents.ts:27-31` under workspace-symlink + Node's default realpath lands on `packages/rpiv-pi/` (Pi has no `--preserve-symlinks` anywhere). Verified by simulation of tarball, workspace, and in-monorepo execution.
- **`files` array drift exists** — `rpiv-advisor/btw/todo/rpiv-pi` declare explicit `files`; `rpiv-ask-user-question` and `rpiv-web-tools` omit it. Must normalize per-package (root `.npmignore` does NOT affect workspace-package tarballs).
- **Banner URL rewrites required** — 5 of 6 README files at `raw.githubusercontent.com/juicesharp/<name>/main/docs/*.jpg` will NOT survive repo transfer (GitHub does not redirect the raw domain). rpiv-pi has no banner.
- **rpiv-pi CHANGELOG has 4 hardcoded compare/release links** at `CHANGELOG.md:62-65` pointing at current source repo — must rewrite to rpiv-mono.
- **LICENSE currently shipped in tarballs** for rpiv-pi and rpiv-btw; absent for 4 siblings. pi-mono publishes tarballs without LICENSE files.
- **Publish precedent is rocky** — forward extraction `c388ea9` needed 2 weeks of follow-up publish fixes (`1c5ebfa`, `40af701`, `b9428e9`, `2150cc4`, `daf7ee6`). Preflight `npm pack` every package before the first monorepo publish.
- **pi-mono template verified** — `scripts/release.mjs` promotes `## [Unreleased]` verbatim, delegates version bump to `npm version <type> -ws`, publishes via `npm publish -ws --access public`. `sync-versions.js` enforces lockstep + rewrites caret ranges for `dependencies`/`devDependencies` only (not `peerDependencies` — desired). Local-only; no CI publish step.

## Scope

### Building

- `rpiv-mono` root scaffold: `package.json` (private + workspaces), `tsconfig.base.json`, `biome.json`, `.gitignore`, `LICENSE`, `README.md`, `.husky/pre-commit`
- `scripts/release.mjs` (adapted from pi-mono — drop build/clean/browser-smoke steps)
- `scripts/sync-versions.js` (adopted from pi-mono, reference version read from `packages/rpiv-pi/package.json`)
- `packages/rpiv-pi/`: existing tree + rewritten `package.json` + rewritten `CHANGELOG.md`
- `packages/<sibling>/` × 5: existing tree + rewritten `package.json` + rewritten `README.md` (banner URL) + new `CHANGELOG.md` (seeded) + `LICENSE` copy (for 4 siblings that lack one)
- CHANGELOG seeding — 5 siblings get `# Changelog\n\n## [Unreleased]\n` scaffold, no back-history
- Version alignment — one-shot bump of all 6 packages to `0.6.0` in the consolidation commit; first lockstep release is `0.6.1` via `node scripts/release.mjs patch`
- `thoughts/` seeded from `rpiv-pi/thoughts/` at monorepo root (single pipeline artifact store)

### Not Building

- `rpiv-core` extraction (Phase 2 — extract `extensions/rpiv-core/` into `packages/rpiv-core/` with rpiv-pi depending on `@juicesharp/rpiv-core`). Zero-cross-imports shape stays intact in Phase 1.
- Test-skills extraction (Phase 3, if pursued).
- `.github/workflows/` — no CI in Phase 1. Pre-commit husky catches local issues. Defer CI until tests or deeper build exist.
- `PACKAGE_ROOT` modernization — the three-dirname walk at `agents.ts:27-31` stays as-is. Port to `new URL("./agents/", import.meta.url)` only if a future refactor forces it.
- `rpiv-skillbased` inclusion — excluded; stays at its truvis remote as a Claude-Code-host reference bundle. Scope is Pi-only, publishable-only.
- Source-repo archival — source repos stay live; only their READMEs get a "Moved to rpiv-mono" pointer (operational task, not a design artifact).
- Root `CHANGELOG.md` — pi-mono has none; per-package CHANGELOGs are the contract. Same here.
- `dist/`, `tsconfig.build.json`, `vitest.config.ts`, `prepublishOnly: tsc -b`, `exports` maps, `build-binaries.yml` — pi-mono carries these for its build step; rpiv-mono has no build (Pi loads raw `.ts` via `@mariozechner/jiti`).
- `nested example workspaces` — pi-mono has several under `packages/coding-agent/examples/`; rpiv-mono has none.
- `renovate` / `dependabot` config — defer.

## Decisions

### Decision 1: GitHub repo destination — fresh `juicesharp/rpiv-mono`

**Developer choice**: new repo, not a rename. Clean slate avoids mixing rpiv-pi-only historical tags (v0.5.x/v0.6.0) with new lockstep tags in a single repo's release list. Every per-package `repository.url`/`homepage`/`bugs.url`, every README banner URL, and every `CHANGELOG.md` compare link gets the `juicesharp/rpiv-mono` path.

### Decision 2: Source-repo fate — live with README pointer, issues/PRs disabled

**Developer choice**: source repos (`juicesharp/rpiv-pi` etc.) stay live. Each source README top replaced with a "Moved to juicesharp/rpiv-mono — file issues there" block. Issues/PRs disabled via repo settings. Old `raw.githubusercontent.com/juicesharp/<name>/main/docs/*.jpg` URLs continue to resolve during transition (not depended upon after move — banner URLs in monorepo README files point at rpiv-mono).

### Decision 3: CI scope Phase 1 — none

**Developer choice**: no `.github/workflows/` in Phase 1. Pre-commit husky hook (`biome check` + `tsc --noEmit`) catches most issues locally. Revisit when tests land.

### Decision 4: `PACKAGE_ROOT` — leave unchanged

**Developer choice**: keep `agents.ts:27-31` three-dirname walk byte-identical. Verified working under `packages/rpiv-pi/` via workspace-symlink realpath. Port to depth-agnostic pattern only if a future refactor nests `agents.ts` deeper (e.g., Phase 2 `rpiv-core` extraction is a natural trigger).

### Decision 5: LICENSE strategy — copy into each package dir

**Ambiguity**: npm does NOT auto-include monorepo-root LICENSE into workspace-package tarballs. rpiv-pi and rpiv-btw currently ship LICENSE; regressing that for new consumers is undesirable.

**Explored**:
- Option A — root-only LICENSE (pi-mono's approach): single file, but tarballs carry only `"license": "MIT"` SPDX field. Regresses current shipping behavior for rpiv-pi/rpiv-btw.
- Option B — copy LICENSE into each `packages/<name>/` dir: 7 identical files (1 root + 6 per-package) tracked in git. All 6 tarballs carry LICENSE. Drift risk only if root LICENSE changes (rare).
- Option C — symlinks `packages/<name>/LICENSE → ../../LICENSE`: npm follows symlinks on publish, but fragile on Windows checkouts with `git core.symlinks=false`.

**Decision**: Option B. Root `LICENSE` + 6 per-package `LICENSE` files. rpiv-pi and rpiv-btw keep `"LICENSE"` in their `files` arrays; 4 other siblings add it to a new/normalized `files` array.

### Decision 6: Publish pipeline — pi-mono `release.mjs`, adapted

Inherited from research Developer Context. Preserves Keep-a-Changelog prose verbatim; auto-promotes `## [Unreleased]` to versioned header; local-run on maintainer laptop (no CI secrets). Adaptations: drop `clean`/`build`/`browser-smoke` steps (Pi loads raw TS); `getVersion()` reads `packages/rpiv-pi/package.json` (not `packages/ai/` like pi-mono).

### Decision 7: Versioning — lockstep starting at 0.6.0

Inherited from research Developer Context. All 6 packages aligned at 0.6.0 in the consolidation commit; first lockstep release is 0.6.1 via `node scripts/release.mjs patch`. Siblings jump from 0.1.x to 0.6.0 as the consolidation signal.

### Decision 8: Inter-package dep protocol — caret ranges, rewritten on publish

Inherited from research Developer Context. Zero-cross-imports in Phase 1, so `sync-versions.js` runs as a no-op (pi-mono's logic iterates `dependencies`/`devDependencies` only, skipping `peerDependencies:"*"` — desired). Phase 2 introduces the first real `dependencies` edge (`@juicesharp/rpiv-pi` → `@juicesharp/rpiv-core`) written as `"^0.6.0"` and rewritten to `"^<current>"` on each publish.

### Decision 9: Git history — fresh init

Inherited from research Developer Context. No subtree merges, no filter-repo rewrites, no 6 roots in log. Source repos remain available as forks-of-record if history lookup is ever needed.

### Decision 10: rpiv-skillbased — excluded

Inherited from research Developer Context + existing memory note. Monorepo scope is Pi-only, publishable-only. rpiv-skillbased stays at its truvis remote.

### Decision 11: CHANGELOG seeding — 5 siblings get bare `## [Unreleased]` + one `## [0.6.0]` consolidation entry

Inherited from research Open Questions recommendation, refined during checklist reconciliation. Seeding the five missing CHANGELOGs as a bare `## [Unreleased]` is insufficient: the 0.1.x → 0.6.0 jump is a semantic discontinuity that existing consumers and future archaeology need explained. Seed pattern becomes:

```
# Changelog

All notable changes to `@juicesharp/<name>` are documented here.

Format: [Keep a Changelog](...).
Versioning: [Semantic Versioning](...).

## [Unreleased]

## [0.6.0] — 2026-04-18

### Changed
- Consolidated into the `juicesharp/rpiv-mono` monorepo. Version aligned to the rpiv-pi family lockstep starting point. No runtime behavior change from `0.1.x`.
```

Downstream impact: consumers who pinned `^0.1.x` against the old standalone package will NOT auto-receive `0.6.0+` (semver caret-range upper bound). This is intentional — the jump is a signal, not a silent upgrade. Install-by-name remains stable (`pi install npm:@juicesharp/rpiv-<name>` resolves to latest), and the monorepo's npm publish continues to expose `0.1.x` versions in the registry (already published) so existing pinned installs are not broken, only frozen. Documented in Migration Notes.

### Decision 12: Root `thoughts/` — single pipeline artifact store, seeded from rpiv-pi

rpiv-pi's `thoughts/` directory (30+ research/design/plan artifacts including this research) moves to monorepo root as `thoughts/`. rpiv-advisor's 3 advisor-specific historical artifacts are NOT merged in (they're extraction-era; archived in source repo's git history). Single pipeline per monorepo matches the skill-based model.

### Decision 13: `scripts/migrate.js` stays inside `packages/rpiv-pi/scripts/`

Runtime-shipped script listed in `rpiv-pi/package.json:20` `files:["scripts/"]`. Does NOT move to monorepo root — `/scripts/` at root is reserved for repo-level tooling (release.mjs, sync-versions.js). No collision.

## Architecture

### `/package.json` — NEW

Root monorepo manifest. Private (never published). Declares workspaces, dev tooling, and release scripts.

```json
{
	"name": "rpiv-mono",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"workspaces": ["packages/*"],
	"scripts": {
		"check": "biome check --write --error-on-warnings . && tsc --noEmit -p tsconfig.base.json",
		"test": "npm run test --workspaces --if-present",
		"version:patch": "npm version patch -ws --no-git-tag-version && node scripts/sync-versions.js && shx rm -rf node_modules packages/*/node_modules package-lock.json && npm install",
		"version:minor": "npm version minor -ws --no-git-tag-version && node scripts/sync-versions.js && shx rm -rf node_modules packages/*/node_modules package-lock.json && npm install",
		"version:major": "npm version major -ws --no-git-tag-version && node scripts/sync-versions.js && shx rm -rf node_modules packages/*/node_modules package-lock.json && npm install",
		"prepublishOnly": "npm run check",
		"publish": "npm run prepublishOnly && npm publish -ws --access public",
		"publish:dry": "npm run prepublishOnly && npm publish -ws --access public --dry-run",
		"release:patch": "node scripts/release.mjs patch",
		"release:minor": "node scripts/release.mjs minor",
		"release:major": "node scripts/release.mjs major",
		"prepare": "husky"
	},
	"devDependencies": {
		"@biomejs/biome": "2.3.5",
		"@types/node": "^22.10.5",
		"husky": "^9.1.7",
		"shx": "^0.4.0",
		"typescript": "^5.9.2"
	},
	"engines": {
		"node": ">=20.0.0"
	}
}
```

### `/tsconfig.base.json` — NEW

Shared TypeScript config for IDE typechecking only. No build emission anywhere in the monorepo. Used directly by `tsc --noEmit` at root in the `check` script; per-package `tsconfig.json` files are NOT created in Phase 1 (siblings don't have them today).

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "Node16",
		"moduleResolution": "Node16",
		"lib": ["ES2022"],
		"strict": true,
		"esModuleInterop": true,
		"skipLibCheck": true,
		"forceConsistentCasingInFileNames": true,
		"resolveJsonModule": true,
		"allowImportingTsExtensions": false,
		"noEmit": true,
		"types": ["node"]
	},
	"include": ["packages/*/**/*.ts"],
	"exclude": [
		"**/node_modules/**",
		"**/.pi/**",
		"**/.rpiv/**",
		"**/thoughts/**"
	]
}
```

### `/biome.json` — NEW

Shared Biome config for formatting + linting. Covers `packages/*/**/*.{ts,js}` and `scripts/**/*.{js,mjs}`. Linter overrides and formatter style copied from pi-mono reference to match ecosystem convention.

```json
{
	"$schema": "https://biomejs.dev/schemas/2.3.5/schema.json",
	"linter": {
		"enabled": true,
		"rules": {
			"recommended": true,
			"style": {
				"noNonNullAssertion": "off",
				"useConst": "error",
				"useNodejsImportProtocol": "off"
			},
			"suspicious": {
				"noExplicitAny": "off",
				"noControlCharactersInRegex": "off",
				"noEmptyInterface": "off"
			}
		}
	},
	"formatter": {
		"enabled": true,
		"formatWithErrors": false,
		"indentStyle": "tab",
		"indentWidth": 3,
		"lineWidth": 120
	},
	"files": {
		"includes": [
			"packages/*/**/*.ts",
			"packages/*/**/*.js",
			"scripts/**/*.js",
			"scripts/**/*.mjs",
			"!**/node_modules/**",
			"!**/.pi/**",
			"!**/.rpiv/**",
			"!**/thoughts/**",
			"!**/docs/**"
		]
	}
}
```

### `/.gitignore` — NEW

Unified ignore file. Replaces four divergent per-package copies (rpiv-pi/.gitignore, rpiv-advisor/.gitignore, rpiv-btw/.gitignore, rpiv-todo/.gitignore). Does NOT ignore `.rpiv/` (rpiv-pi's `.rpiv/guidance/` tree is source-of-truth and IS committed), `thoughts/` (pipeline artifacts IS committed), or `package-lock.json` (monorepo root lockfile IS committed).

```
node_modules/
packages/*/node_modules/

*.log
.DS_Store
*.tsbuildinfo
*.cpuprofile

.pi/

# Environment
.env

# Editor files
.vscode/
.zed/
.idea/
*.swp
*.swo
*~

# Package specific
.npm/
coverage/
.nyc_output/
```

### `/LICENSE` — NEW

MIT license, monorepo root. Byte-identical content copied into each `packages/<name>/LICENSE` per Decision 5.

```
MIT License

Copyright (c) 2026 juicesharp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `/README.md` — NEW

Monorepo overview + package roster + install links + release procedure. Short — each package has its own README.

````markdown
# rpiv-mono

Monorepo for Pi CLI plugins in the `@juicesharp/rpiv-*` family. Lockstep versions, single install, single publish pipeline.

## Packages

| Package | Description |
|---|---|
| [`@juicesharp/rpiv-pi`](packages/rpiv-pi) | Skill-based development workflow for Pi Agent — discover, research, design, plan, implement, validate |
| [`@juicesharp/rpiv-advisor`](packages/rpiv-advisor) | Advisor-strategy pattern — escalate to a stronger reviewer model |
| [`@juicesharp/rpiv-ask-user-question`](packages/rpiv-ask-user-question) | Structured clarifying-question tool |
| [`@juicesharp/rpiv-btw`](packages/rpiv-btw) | `/btw` side-question slash command |
| [`@juicesharp/rpiv-todo`](packages/rpiv-todo) | Claude-Code-parity todo tool + persistent overlay |
| [`@juicesharp/rpiv-web-tools`](packages/rpiv-web-tools) | `web_search` + `web_fetch` via the Brave Search API |

Each package is published independently to npm and installable by name:

```bash
pi install npm:@juicesharp/rpiv-pi
pi install npm:@juicesharp/rpiv-advisor
# …
```

`@juicesharp/rpiv-pi` registers the others as siblings; `/rpiv-setup` installs any that are missing.

## Development

```bash
npm install          # one install at root; workspace symlinks under node_modules/
npm run check        # biome + tsc --noEmit across all packages
npm test             # forwarded to packages that declare a test script
```

Pre-commit hooks (husky) run `npm run check` before every commit.

## Releasing

All 6 packages version in lockstep. One command cuts a release of all of them:

```bash
node scripts/release.mjs patch     # e.g. 0.6.0 → 0.6.1
node scripts/release.mjs minor     # 0.6.0 → 0.7.0
node scripts/release.mjs major     # 0.6.0 → 1.0.0
node scripts/release.mjs 1.2.3     # explicit version
```

The script bumps every `packages/*/package.json`, promotes each package's `## [Unreleased]` CHANGELOG heading to `## [X.Y.Z] - YYYY-MM-DD`, commits, tags `vX.Y.Z`, runs `npm publish -ws --access public`, reinstates a fresh `## [Unreleased]` block, and pushes `main` + tag.

## License

[MIT](LICENSE) © juicesharp
````

### `/.husky/pre-commit` — NEW

Runs on every commit. Invokes `npm run check` (biome + tsc --noEmit). Adapted from pi-mono: drops the browser-smoke branch (no browser code here); keeps the biome-rewrite restage step so formatter autofixes land in the commit.

```sh
#!/bin/sh

# Capture staged files before biome potentially rewrites them
STAGED_FILES=$(git diff --cached --name-only)

echo "Running formatting, linting, and type checking..."
npm run check
if [ $? -ne 0 ]; then
  echo "❌ Checks failed. Please fix the errors before committing."
  exit 1
fi

# Restage any files biome --write modified
for file in $STAGED_FILES; do
  if [ -f "$file" ]; then
    git add "$file"
  fi
done

echo "✅ All pre-commit checks passed!"
```

### `/scripts/release.mjs` — NEW

Lockstep release pipeline. Usage: `node scripts/release.mjs <major|minor|patch|x.y.z>`. Adapted from `badlogic/pi-mono`: drops clean/build steps; reads reference version from `packages/rpiv-pi/package.json`; `addUnreleasedSection()` regex updated to handle rpiv-pi's Keep-a-Changelog intro prose (inserts before first `## […]` heading rather than immediately after `# Changelog`).

```js
#!/usr/bin/env node
/**
 * Release script for rpiv-mono
 *
 * Usage:
 *   node scripts/release.mjs <major|minor|patch>
 *   node scripts/release.mjs <x.y.z>
 *
 * Steps:
 * 1. Check for uncommitted changes
 * 2. Bump version via npm run version:xxx (lockstep across all packages)
 * 3. Promote each package CHANGELOG: [Unreleased] -> [version] - date
 * 4. Commit and tag
 * 5. Publish to npm (npm publish -ws --access public)
 * 6. Reinstate [Unreleased] section in each CHANGELOG
 * 7. Commit the [Unreleased] reinstatement
 * 8. Push main + tag
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const RELEASE_TARGET = process.argv[2];
const BUMP_TYPES = new Set(["major", "minor", "patch"]);
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

if (!RELEASE_TARGET || (!BUMP_TYPES.has(RELEASE_TARGET) && !SEMVER_RE.test(RELEASE_TARGET))) {
	console.error("Usage: node scripts/release.mjs <major|minor|patch|x.y.z>");
	process.exit(1);
}

function run(cmd, options = {}) {
	console.log(`$ ${cmd}`);
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: options.silent ? "pipe" : "inherit", ...options });
	} catch (e) {
		if (!options.ignoreError) {
			console.error(`Command failed: ${cmd}`);
			process.exit(1);
		}
		return null;
	}
}

function getVersion() {
	const pkg = JSON.parse(readFileSync("packages/rpiv-pi/package.json", "utf-8"));
	return pkg.version;
}

function compareVersions(a, b) {
	const aParts = a.split(".").map(Number);
	const bParts = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		const diff = (aParts[i] || 0) - (bParts[i] || 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stageChangedFiles() {
	const output = run("git ls-files -m -o -d --exclude-standard", { silent: true });
	const paths = [...new Set((output || "").split("\n").map((line) => line.trim()).filter(Boolean))];
	if (paths.length === 0) return;
	run(`git add -- ${paths.map(shellQuote).join(" ")}`);
}

function bumpOrSetVersion(target) {
	const currentVersion = getVersion();

	if (BUMP_TYPES.has(target)) {
		console.log(`Bumping version (${target})...`);
		run(`npm run version:${target}`);
		return getVersion();
	}

	if (compareVersions(target, currentVersion) <= 0) {
		console.error(`Error: explicit version ${target} must be greater than current version ${currentVersion}.`);
		process.exit(1);
	}

	console.log(`Setting explicit version (${target})...`);
	run(
		`npm version ${target} -ws --no-git-tag-version && node scripts/sync-versions.js && npx shx rm -rf node_modules packages/*/node_modules package-lock.json && npm install`,
	);
	return getVersion();
}

function getChangelogs() {
	const packagesDir = "packages";
	const packages = readdirSync(packagesDir);
	return packages
		.map((pkg) => join(packagesDir, pkg, "CHANGELOG.md"))
		.filter((path) => existsSync(path));
}

function updateChangelogsForRelease(version) {
	const date = new Date().toISOString().split("T")[0];
	const changelogs = getChangelogs();

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");

		if (!content.includes("## [Unreleased]")) {
			console.log(`  Skipping ${changelog}: no [Unreleased] section`);
			continue;
		}

		const updated = content.replace("## [Unreleased]", `## [${version}] - ${date}`);
		writeFileSync(changelog, updated);
		console.log(`  Updated ${changelog}`);
	}
}

// Insert "## [Unreleased]" above the first "## [" heading — survives
// Keep-a-Changelog intro prose between "# Changelog" and first version block.
function addUnreleasedSection() {
	const changelogs = getChangelogs();
	const unreleasedSection = "## [Unreleased]\n\n";

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");
		const updated = content.replace(/^(## \[)/m, `${unreleasedSection}$1`);
		writeFileSync(changelog, updated);
		console.log(`  Added [Unreleased] to ${changelog}`);
	}
}

// Main
console.log("\n=== rpiv-mono Release ===\n");

console.log("Checking for uncommitted changes...");
const status = run("git status --porcelain", { silent: true });
if (status && status.trim()) {
	console.error("Error: Uncommitted changes detected. Commit or stash first.");
	console.error(status);
	process.exit(1);
}
console.log("  Working directory clean\n");

const version = bumpOrSetVersion(RELEASE_TARGET);
console.log(`  New version: ${version}\n`);

console.log("Promoting CHANGELOG.md [Unreleased] sections...");
updateChangelogsForRelease(version);
console.log();

console.log("Committing and tagging...");
stageChangedFiles();
run(`git commit -m "Release v${version}"`);
run(`git tag v${version}`);
console.log();

console.log("Publishing to npm...");
run("npm run publish");
console.log();

console.log("Reinstating [Unreleased] sections for next cycle...");
addUnreleasedSection();
console.log();

console.log("Committing changelog updates...");
stageChangedFiles();
run(`git commit -m "Add [Unreleased] section for next cycle"`);
console.log();

console.log("Pushing to remote...");
run("git push origin main");
run(`git push origin v${version}`);
console.log();

console.log(`=== Released v${version} ===`);
```

### `/scripts/sync-versions.js` — NEW

Verifies lockstep across all `packages/*`; rewrites intra-monorepo `dependencies`/`devDependencies` to `^<current>`. No-op in Phase 1 (zero inter-package `dependencies` edges — only `peerDependencies:"*"` which this script does not touch by design). Adopted from `badlogic/pi-mono/scripts/sync-versions.js` with only the header comment updated to reference `@juicesharp/rpiv-*`.

```js
#!/usr/bin/env node

/**
 * Syncs ALL @juicesharp/rpiv-* intra-monorepo package dependency versions
 * to match their current versions. Enforces lockstep versioning.
 *
 * Runs `dependencies` and `devDependencies` only — `peerDependencies:"*"`
 * is untouched by design (Phase 1 zero-cross-imports contract).
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const packagesDir = join(process.cwd(), "packages");
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
	.filter((dirent) => dirent.isDirectory())
	.map((dirent) => dirent.name);

// Read all package.json files and build version map
const packages = {};
const versionMap = {};

for (const dir of packageDirs) {
	const pkgPath = join(packagesDir, dir, "package.json");
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
		packages[dir] = { path: pkgPath, data: pkg };
		versionMap[pkg.name] = pkg.version;
	} catch (e) {
		console.error(`Failed to read ${pkgPath}:`, e.message);
	}
}

console.log("Current versions:");
for (const [name, version] of Object.entries(versionMap).sort()) {
	console.log(`  ${name}: ${version}`);
}

// Verify all versions are the same (lockstep)
const versions = new Set(Object.values(versionMap));
if (versions.size > 1) {
	console.error("\n❌ ERROR: Not all packages have the same version!");
	console.error("Expected lockstep versioning. Run one of:");
	console.error("  npm run version:patch");
	console.error("  npm run version:minor");
	console.error("  npm run version:major");
	process.exit(1);
}

console.log("\n✅ All packages at same version (lockstep)");

// Update all inter-package dependencies
let totalUpdates = 0;
for (const [_dir, pkg] of Object.entries(packages)) {
	let updated = false;

	if (pkg.data.dependencies) {
		for (const [depName, currentVersion] of Object.entries(pkg.data.dependencies)) {
			if (versionMap[depName]) {
				const newVersion = `^${versionMap[depName]}`;
				if (currentVersion !== newVersion) {
					console.log(`\n${pkg.data.name}:`);
					console.log(`  ${depName}: ${currentVersion} → ${newVersion}`);
					pkg.data.dependencies[depName] = newVersion;
					updated = true;
					totalUpdates++;
				}
			}
		}
	}

	if (pkg.data.devDependencies) {
		for (const [depName, currentVersion] of Object.entries(pkg.data.devDependencies)) {
			if (versionMap[depName]) {
				const newVersion = `^${versionMap[depName]}`;
				if (currentVersion !== newVersion) {
					console.log(`\n${pkg.data.name}:`);
					console.log(`  ${depName}: ${currentVersion} → ${newVersion} (devDependencies)`);
					pkg.data.devDependencies[depName] = newVersion;
					updated = true;
					totalUpdates++;
				}
			}
		}
	}

	if (updated) {
		writeFileSync(pkg.path, JSON.stringify(pkg.data, null, "\t") + "\n");
	}
}

if (totalUpdates === 0) {
	console.log("\nAll inter-package dependencies already in sync.");
} else {
	console.log(`\n✅ Updated ${totalUpdates} dependency version(s)`);
}
```

### `packages/rpiv-pi/package.json` — MODIFY

`repository.url` / `homepage` / `bugs.url` rewritten. `repository.directory` added (npm monorepo convention — npmjs.com uses it to link to the correct package subdirectory). Version stays 0.6.0 (already aligned). `files` / `pi` / `peerDependencies` unchanged. Full file shown for implementer clarity (35 lines).

```json
{
  "name": "@juicesharp/rpiv-pi",
  "version": "0.6.0",
  "description": "Skill-based development workflow for Pi Agent — discover, research, design, plan, implement, validate",
  "keywords": ["pi-package", "pi-extension", "rpiv", "skills", "workflow"],
  "license": "MIT",
  "author": "juicesharp",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/juicesharp/rpiv-mono.git",
    "directory": "packages/rpiv-pi"
  },
  "homepage": "https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-pi#readme",
  "bugs": {
    "url": "https://github.com/juicesharp/rpiv-mono/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": ["extensions/", "skills/", "agents/", "scripts/", "README.md", "LICENSE"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@tintinweb/pi-subagents": "*",
    "@juicesharp/rpiv-ask-user-question": "*",
    "@juicesharp/rpiv-todo": "*",
    "@juicesharp/rpiv-advisor": "*",
    "@juicesharp/rpiv-btw": "*",
    "@juicesharp/rpiv-web-tools": "*"
  }
}
```

### `packages/rpiv-pi/CHANGELOG.md:62-65` — MODIFY

Only the footer anchor block changes. Lines 1-61 (prose + version sections) preserved byte-identical. `[Unreleased]` anchor REMOVED (would 404 against rpiv-mono until first lockstep release creates v0.6.1 tag; Keep-a-Changelog allows a plain-text `## [Unreleased]` heading without an anchor). Old-version anchors keep pointing at `juicesharp/rpiv-pi/releases/tag/*` (source repo stays live per Decision 2 — tags remain resolvable). Replace old lines 62-65 with these 3 lines:

```markdown
[0.6.0]: https://github.com/juicesharp/rpiv-pi/releases/tag/v0.6.0
[0.5.1]: https://github.com/juicesharp/rpiv-pi/releases/tag/v0.5.1
[0.5.0]: https://github.com/juicesharp/rpiv-pi/releases/tag/v0.5.0
```

### `packages/rpiv-pi/LICENSE` — EXISTING (moves unchanged from source)

Existing `rpiv-pi/LICENSE` copies verbatim. No edit. Tracked here for completeness; not listed in File Map as a generated artifact.

### `packages/rpiv-advisor/package.json` — MODIFY

`repository.url`/`homepage`/`bugs.url` → rpiv-mono. `repository.directory` added. Version bumped 0.1.3 → 0.6.0. `"LICENSE"` added to existing `files` array. Everything else unchanged.

```json
{
  "name": "@juicesharp/rpiv-advisor",
  "version": "0.6.0",
  "description": "Pi extension: advisor-strategy pattern — escalate to a stronger reviewer model",
  "keywords": ["pi-package", "pi-extension", "rpiv", "advisor"],
  "type": "module",
  "license": "MIT",
  "author": "juicesharp",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/juicesharp/rpiv-mono.git",
    "directory": "packages/rpiv-advisor"
  },
  "homepage": "https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-advisor#readme",
  "bugs": {
    "url": "https://github.com/juicesharp/rpiv-mono/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "index.ts",
    "advisor.ts",
    "advisor-ui.ts",
    "prompts/",
    "README.md",
    "LICENSE"
  ],
  "pi": {
    "extensions": ["./index.ts"]
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

### `packages/rpiv-advisor/README.md:8` — MODIFY

Single line rewrite. All other README content byte-identical.

```markdown
![Advisor model selector](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-advisor/docs/advisor.jpg)
```

### `packages/rpiv-advisor/CHANGELOG.md` — NEW

Seeded scaffold. release.mjs promotes `## [Unreleased]` to `## [0.6.1] - YYYY-MM-DD` on first lockstep release.

```markdown
# Changelog

All notable changes to `@juicesharp/rpiv-advisor` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] — 2026-04-18

### Changed
- Consolidated into the `juicesharp/rpiv-mono` monorepo. Version aligned to the rpiv-pi family lockstep starting point. No runtime behavior change from `0.1.3`.
```

### `packages/rpiv-advisor/LICENSE` — NEW

Byte-identical copy of `/LICENSE`.

```
MIT License

Copyright (c) 2026 juicesharp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `packages/rpiv-ask-user-question/package.json` — MODIFY

`repository.url`/`homepage`/`bugs.url` → rpiv-mono. `repository.directory` added. Version bumped 0.1.4 → 0.6.0. `files` array CREATED (previously absent — relied on npm defaults which would have shipped `docs/` and `package.json` alongside source). Everything else unchanged.

```json
{
  "name": "@juicesharp/rpiv-ask-user-question",
  "version": "0.6.0",
  "description": "Pi extension: lets the model ask you a clarifying question with structured options instead of guessing",
  "keywords": ["pi-package", "pi-extension", "rpiv"],
  "type": "module",
  "license": "MIT",
  "author": "juicesharp",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/juicesharp/rpiv-mono.git",
    "directory": "packages/rpiv-ask-user-question"
  },
  "homepage": "https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question#readme",
  "bugs": {
    "url": "https://github.com/juicesharp/rpiv-mono/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "index.ts",
    "ask-user-question.ts",
    "wrapping-select.ts",
    "README.md",
    "LICENSE"
  ],
  "pi": {
    "extensions": ["./index.ts"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

### `packages/rpiv-ask-user-question/README.md:7` — MODIFY

Single line rewrite.

```markdown
![Structured question prompt](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-ask-user-question/docs/prompt.jpg)
```

### `packages/rpiv-ask-user-question/CHANGELOG.md` — NEW

Keep-a-Changelog scaffold.

```markdown
# Changelog

All notable changes to `@juicesharp/rpiv-ask-user-question` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] — 2026-04-18

### Changed
- Consolidated into the `juicesharp/rpiv-mono` monorepo. Version aligned to the rpiv-pi family lockstep starting point. No runtime behavior change from `0.1.4`.
```

### `packages/rpiv-ask-user-question/LICENSE` — NEW

Byte-identical copy of `/LICENSE`.

```
MIT License

Copyright (c) 2026 juicesharp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `packages/rpiv-btw/package.json` — MODIFY

`repository.url`/`homepage`/`bugs.url` → rpiv-mono. `repository.directory` added. Version bumped 0.1.1 → 0.6.0. `files` array unchanged (already includes `"LICENSE"`). Everything else unchanged.

```json
{
  "name": "@juicesharp/rpiv-btw",
  "version": "0.6.0",
  "description": "Pi extension: /btw side-question slash command — ask the same primary model a one-off side question without polluting the main conversation",
  "keywords": ["pi-package", "pi-extension", "rpiv", "btw", "side-question", "overlay"],
  "type": "module",
  "license": "MIT",
  "author": "juicesharp",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/juicesharp/rpiv-mono.git",
    "directory": "packages/rpiv-btw"
  },
  "homepage": "https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-btw#readme",
  "bugs": {
    "url": "https://github.com/juicesharp/rpiv-mono/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "index.ts",
    "btw.ts",
    "btw-ui.ts",
    "prompts/",
    "README.md",
    "LICENSE"
  ],
  "pi": {
    "extensions": ["./index.ts"]
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*"
  }
}
```

### `packages/rpiv-btw/README.md:8` — MODIFY

Single line rewrite.

```markdown
![The /btw side-question panel at the bottom of the Pi terminal](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-btw/docs/overlay.jpg)
```

### `packages/rpiv-btw/CHANGELOG.md` — NEW

Keep-a-Changelog scaffold.

```markdown
# Changelog

All notable changes to `@juicesharp/rpiv-btw` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] — 2026-04-18

### Changed
- Consolidated into the `juicesharp/rpiv-mono` monorepo. Version aligned to the rpiv-pi family lockstep starting point. No runtime behavior change from `0.1.1`.
```

### `packages/rpiv-btw/LICENSE` — EXISTING (moves unchanged from source)

Existing `rpiv-btw/LICENSE` moves to `packages/rpiv-btw/LICENSE` unchanged. No generated artifact; content already byte-identical to root LICENSE.

### `packages/rpiv-todo/package.json` — MODIFY

`repository.url`/`homepage`/`bugs.url` → rpiv-mono. `repository.directory` added. Version bumped 0.1.2 → 0.6.0. `"LICENSE"` added to existing `files` array. Everything else unchanged.

```json
{
  "name": "@juicesharp/rpiv-todo",
  "version": "0.6.0",
  "description": "Pi extension: Claude-Code-parity todo tool + persistent overlay widget",
  "keywords": [
    "pi-package",
    "pi-extension",
    "rpiv",
    "todo"
  ],
  "type": "module",
  "license": "MIT",
  "author": "juicesharp",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/juicesharp/rpiv-mono.git",
    "directory": "packages/rpiv-todo"
  },
  "homepage": "https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo#readme",
  "bugs": {
    "url": "https://github.com/juicesharp/rpiv-mono/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "index.ts",
    "todo.ts",
    "todo-overlay.ts",
    "README.md",
    "LICENSE"
  ],
  "pi": {
    "extensions": [
      "./index.ts"
    ]
  },
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

### `packages/rpiv-todo/README.md:7` — MODIFY

Single line rewrite.

```markdown
![Todo overlay widget above the Pi editor](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-todo/docs/overlay.jpg)
```

### `packages/rpiv-todo/CHANGELOG.md` — NEW

Keep-a-Changelog scaffold.

```markdown
# Changelog

All notable changes to `@juicesharp/rpiv-todo` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] — 2026-04-18

### Changed
- Consolidated into the `juicesharp/rpiv-mono` monorepo. Version aligned to the rpiv-pi family lockstep starting point. No runtime behavior change from `0.1.2`.
```

### `packages/rpiv-todo/LICENSE` — NEW

Byte-identical copy of `/LICENSE`.

```
MIT License

Copyright (c) 2026 juicesharp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `packages/rpiv-web-tools/package.json` — MODIFY

`repository.url`/`homepage`/`bugs.url` → rpiv-mono. `repository.directory` added. Version bumped 0.1.2 → 0.6.0. `files` array CREATED (previously absent). Everything else unchanged.

```json
{
  "name": "@juicesharp/rpiv-web-tools",
  "version": "0.6.0",
  "description": "Pi extension: web_search + web_fetch via the Brave Search API",
  "keywords": ["pi-package", "pi-extension", "rpiv", "web-search", "brave"],
  "type": "module",
  "license": "MIT",
  "author": "juicesharp",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/juicesharp/rpiv-mono.git",
    "directory": "packages/rpiv-web-tools"
  },
  "homepage": "https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-web-tools#readme",
  "bugs": {
    "url": "https://github.com/juicesharp/rpiv-mono/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "index.ts",
    "README.md",
    "LICENSE"
  ],
  "pi": {
    "extensions": ["./index.ts"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

### `packages/rpiv-web-tools/README.md:7` — MODIFY

Single line rewrite.

```markdown
![Brave Search API key prompt](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-web-tools/docs/config.jpg)
```

### `packages/rpiv-web-tools/CHANGELOG.md` — NEW

Keep-a-Changelog scaffold.

```markdown
# Changelog

All notable changes to `@juicesharp/rpiv-web-tools` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] — 2026-04-18

### Changed
- Consolidated into the `juicesharp/rpiv-mono` monorepo. Version aligned to the rpiv-pi family lockstep starting point. No runtime behavior change from `0.1.2`.
```

### `packages/rpiv-web-tools/LICENSE` — NEW

Byte-identical copy of `/LICENSE`.

```
MIT License

Copyright (c) 2026 juicesharp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Desired End State

From a maintainer's perspective, the daily and release workflows look like:

```bash
# Local dev — one install at monorepo root
cd ~/rpiv-mono && npm install
# npm creates symlinks: packages/rpiv-pi → node_modules/@juicesharp/rpiv-pi etc.
# Pi's session resolves workspace-symlinked packages via default realpath.

# Run Pi against a workspace package during dev
cd packages/rpiv-pi && pi
# /rpiv-setup detects missing siblings (by name, from ~/.pi/agent/settings.json).
# Workspace symlinks mean no "install" is needed for dev — siblings are already linked.

# Edit any package
$EDITOR packages/rpiv-advisor/advisor.ts
# Husky pre-commit runs: biome check + tsc --noEmit

# Add an [Unreleased] entry to any package's CHANGELOG
$EDITOR packages/rpiv-pi/CHANGELOG.md
# Under `## [Unreleased]` add `### Changed` or `### Added` bullets.

# Release all 6 packages in lockstep (local-only, no CI secrets needed)
node scripts/release.mjs patch
# → bumps every packages/*/package.json from 0.6.0 to 0.6.1
# → sync-versions.js enforces lockstep + rewrites any intra-monorepo deps
# → promotes "## [Unreleased]" → "## [0.6.1] - 2026-04-18" in every CHANGELOG
# → git commit "Release v0.6.1" + tag v0.6.1
# → npm publish -ws --access public (all 6 packages to npm in one go)
# → git commit "Add [Unreleased] section for next cycle"
# → git push origin main + git push origin v0.6.1
```

From a customer's perspective — zero change:

```bash
# Install any sibling independently (unchanged contract)
pi install npm:@juicesharp/rpiv-pi
pi install npm:@juicesharp/rpiv-advisor
# ... name-stable, regex-version-agnostic SIBLINGS detection still works.
```

## File Map

```
/package.json                                   # NEW    — root workspaces manifest
/tsconfig.base.json                             # NEW    — shared tsc config
/biome.json                                     # NEW    — shared biome config
/.gitignore                                     # NEW    — unified ignore
/LICENSE                                        # NEW    — MIT, monorepo root
/README.md                                      # NEW    — monorepo overview
/.husky/pre-commit                              # NEW    — biome + tsc on commit
/scripts/release.mjs                            # NEW    — lockstep release pipeline
/scripts/sync-versions.js                       # NEW    — lockstep verify + dep rewrite

packages/rpiv-pi/package.json                   # MODIFY — repo URLs → rpiv-mono
packages/rpiv-pi/CHANGELOG.md                   # MODIFY — compare links → rpiv-mono

packages/rpiv-advisor/package.json              # MODIFY — URLs + v0.6.0 + files: LICENSE
packages/rpiv-advisor/README.md                 # MODIFY — banner URL → rpiv-mono
packages/rpiv-advisor/CHANGELOG.md              # NEW    — Keep-a-Changelog scaffold
packages/rpiv-advisor/LICENSE                   # NEW    — copy of root LICENSE

packages/rpiv-ask-user-question/package.json    # MODIFY — URLs + v0.6.0 + files array
packages/rpiv-ask-user-question/README.md       # MODIFY — banner URL
packages/rpiv-ask-user-question/CHANGELOG.md    # NEW    — scaffold
packages/rpiv-ask-user-question/LICENSE         # NEW    — copy

packages/rpiv-btw/package.json                  # MODIFY — URLs + v0.6.0
packages/rpiv-btw/README.md                     # MODIFY — banner URL
packages/rpiv-btw/CHANGELOG.md                  # NEW    — scaffold

packages/rpiv-todo/package.json                 # MODIFY — URLs + v0.6.0 + files: LICENSE
packages/rpiv-todo/README.md                    # MODIFY — banner URL
packages/rpiv-todo/CHANGELOG.md                 # NEW    — scaffold
packages/rpiv-todo/LICENSE                      # NEW    — copy

packages/rpiv-web-tools/package.json            # MODIFY — URLs + v0.6.0 + files array
packages/rpiv-web-tools/README.md               # MODIFY — banner URL
packages/rpiv-web-tools/CHANGELOG.md            # NEW    — scaffold
packages/rpiv-web-tools/LICENSE                 # NEW    — copy
```

Files that move unchanged (not listed above, captured in Migration Notes): `packages/rpiv-pi/{extensions/,skills/,agents/,scripts/migrate.js,node_modules/ omitted,.rpiv/,README.md,LICENSE}`, `packages/rpiv-advisor/{index.ts,advisor.ts,advisor-ui.ts,prompts/,docs/}`, `packages/rpiv-ask-user-question/{index.ts,...,docs/}`, `packages/rpiv-btw/{index.ts,btw.ts,btw-ui.ts,prompts/,docs/,LICENSE}`, `packages/rpiv-todo/{index.ts,todo.ts,todo-overlay.ts,docs/}`, `packages/rpiv-web-tools/{index.ts,web-tools.ts,...,docs/}`, and root-level `thoughts/` seeded from `rpiv-pi/thoughts/`.

## Ordering Constraints

- Slice 1 (root scaffold) is the foundation — every later slice assumes `/package.json` workspaces array resolves `packages/*`.
- Slice 2 (release tooling) depends on Slice 1: `release.mjs` / `sync-versions.js` read from the workspace structure created in Slice 1.
- Slice 3 (rpiv-pi) and Slice 4 (5 siblings) both depend on Slice 1 but are mutually independent; they modify disjoint file sets.
- Implementation ordering: 1 → 2 → 3 → 4. Within Slice 4, the 5 sibling packages can be applied in any order — pure leaf files, no interdependencies.
- Version alignment happens in the commit that lands Slices 3+4 (or the first `release.mjs` dry-run pre-publishes — see Migration Notes).

## Verification Notes

Per Precedents & Lessons in the research artifact (publish-error recurrence and `files` allowlist drift), these are the verifiable checks this design relies on.

- **Workspace install** — `rm -rf node_modules packages/*/node_modules package-lock.json && npm install` at monorepo root completes cleanly; `ls node_modules/@juicesharp/` shows 6 symlinks.
- **Preflight per package** — `cd packages/<name> && npm pack` for each of the 6 packages; untar each `.tgz` and inspect:
  - rpiv-pi tarball contains `extensions/`, `skills/`, `agents/`, `scripts/migrate.js`, `README.md`, `LICENSE` (matches `files` array).
  - Each sibling tarball contains its `files`-declared contents + `LICENSE`.
  - No stray files (`docs/`, `thoughts/`, `.pi/`, `node_modules/`).
- **Lockstep check** — `node scripts/sync-versions.js` prints "All packages at same version (lockstep)" with zero updates (Phase 1 has no intra-monorepo `dependencies`).
- **PACKAGE_ROOT simulation** — `cd packages/rpiv-pi && node --input-type=module -e 'import { fileURLToPath } from "node:url"; import { dirname } from "node:path"; const f = new URL("extensions/rpiv-core/agents.ts", "file://" + process.cwd() + "/"); console.log(dirname(dirname(dirname(fileURLToPath(f)))))'` prints the package root (verifies the three-dirname walk).
- **Biome + tsc** — `npx biome check packages/` and `npx tsc --noEmit -p tsconfig.base.json` pass.
- **Pi session smoke** — `cd packages/rpiv-pi && pi` loads, `/rpiv-setup` reports all siblings as installed (workspace symlinks in `node_modules/@juicesharp/` count — Pi's detection is regex on `~/.pi/agent/settings.json`, so this depends on the maintainer's local settings; documented as manual step).
- **CHANGELOG `[Unreleased]` anchor** — `grep -c "## \[Unreleased\]" packages/*/CHANGELOG.md` returns 6 (one per package) — `release.mjs` skips packages missing the anchor.
- **Banner URL resolution** — `curl -I https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-advisor/docs/advisor.jpg` returns 200 after first `main` push.
- **Dry-run publish** — `node scripts/release.mjs patch` with `npm publish` replaced by `npm publish --dry-run` on a throwaway branch validates the version-bump + CHANGELOG promotion + tag sequence end-to-end before any real publish.

## Performance Considerations

Not applicable — monorepo consolidation has no runtime performance implications. Install-time notes:

- `npm install` at monorepo root is strictly faster than 6 separate clones + installs (deduplicated deps, single lockfile).
- Pi load path is unchanged; no additional indirection at session start.

## Migration Notes

### File Movement Manifest

Every file below moves **without modification** from the source repo into `packages/<name>/` in the fresh monorepo. These are not listed in the File Map above — they are pure copies tracked only here.

- `rpiv-pi/` → `packages/rpiv-pi/`: `extensions/`, `skills/`, `agents/`, `scripts/migrate.js`, `README.md`, `LICENSE`, `.rpiv/`
- `rpiv-advisor/` → `packages/rpiv-advisor/`: `index.ts`, `advisor.ts`, `advisor-ui.ts`, `prompts/`, `docs/`
- `rpiv-ask-user-question/` → `packages/rpiv-ask-user-question/`: `index.ts`, `*.ts`, `docs/`
- `rpiv-btw/` → `packages/rpiv-btw/`: `index.ts`, `btw.ts`, `btw-ui.ts`, `prompts/`, `docs/`, `LICENSE`
- `rpiv-todo/` → `packages/rpiv-todo/`: `index.ts`, `todo.ts`, `todo-overlay.ts`, `docs/`
- `rpiv-web-tools/` → `packages/rpiv-web-tools/`: `index.ts`, web-tools source files, `docs/`
- `rpiv-pi/thoughts/` → `/thoughts/` (monorepo root)

Per-repo `.gitignore`, `package-lock.json`, and `node_modules/` do NOT migrate — unified `.gitignore` at root replaces them; `npm install` at root regenerates `package-lock.json`.

### First-Release Choreography

1. Create empty `juicesharp/rpiv-mono` GitHub repo.
2. On maintainer laptop: fresh-init local `~/rpiv-mono/`; apply Slices 1–4 (all 35 touched files).
3. Copy unchanged source trees per File Movement Manifest.
4. `npm install` at root; verify workspace symlinks.
5. Preflight `npm pack` per package; inspect tarballs.
6. `git add .` + `git commit -m "Initial monorepo consolidation (v0.6.0 lockstep)"`.
7. `git remote add origin git@github.com:juicesharp/rpiv-mono.git && git push -u origin main`.
8. `node scripts/release.mjs patch` — first lockstep release as v0.6.1.
9. Post-release: update each source repo's README with "Moved to juicesharp/rpiv-mono" pointer; disable issues/PRs via repo settings.

### Rollback Strategy

If the first `release.mjs patch` fails mid-flow (npm publish collision, CHANGELOG format drift, tag push failure):

- **Before publish**: `git reset --hard HEAD~2` (reverts Release commit + Add [Unreleased] commit); delete local tag with `git tag -d v0.6.1`; no upstream state to reconcile.
- **After publish, before tag push**: npm-registry has the packages; delete local tag; do NOT push. Manually resolve the blocking issue, re-run just the tag-push and [Unreleased] commit steps.
- **After tag push**: source-repo path is irreversible; fix forward with a v0.6.2 release carrying the correction.
- Customers are insulated — rollback affects maintainer workflow only. Package names and sibling regex detection are untouched by any release flow.

### Source-Repo README Pointer (post-migration, operational)

After the first rpiv-mono publish and before disabling issues/PRs on each source repo, prepend the following block to the top of every source repo's `README.md` (6 repos: rpiv-pi, rpiv-advisor, rpiv-ask-user-question, rpiv-btw, rpiv-todo, rpiv-web-tools). Replace `<name>` per repo:

```markdown
> **This package has moved.**
>
> `@juicesharp/<name>` now lives in the [`juicesharp/rpiv-mono`](https://github.com/juicesharp/rpiv-mono) monorepo under [`packages/<name>`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/<name>).
>
> - File issues and PRs in [`juicesharp/rpiv-mono/issues`](https://github.com/juicesharp/rpiv-mono/issues).
> - `npm` installs continue to work: the package name `@juicesharp/<name>` is unchanged.
> - This repository remains live as a fork-of-record; historical tags (`v0.1.x`, `v0.5.x`, `v0.6.0`) stay resolvable here.

---
```

After inserting, disable issues and PRs via the source repo's GitHub settings (Settings → General → Features → uncheck Issues, uncheck Sponsorships-unrelated feature blocks; Settings → Branches → require PRs but leave a block rule that redirects — or simpler, archive if Decision 2 later revises).

### thoughts/ and .rpiv/ fate

- **Root `thoughts/`** — seeded from `rpiv-pi/thoughts/` verbatim. Single pipeline artifact store for the whole monorepo. rpiv-advisor's 3 historical `thoughts/` entries (advisor-refactoring design/plan) are NOT merged in; they remain in the source rpiv-advisor repo's git history and can be imported manually on demand.
- **Root `.rpiv/`** — NOT seeded in Phase 1. `rpiv-pi/.rpiv/guidance/` moves INTO `packages/rpiv-pi/.rpiv/guidance/` unchanged (per Decision 4-adjacent reasoning: rpiv-pi remains a standalone package whose guidance docs describe its own subtree). No sibling ships `.rpiv/`. A future monorepo-level `.rpiv/guidance/architecture.md` (Phase 2 artifact) describes the cross-package topology; out of scope here.
- `.gitignore` at root does NOT ignore `thoughts/` or `.rpiv/` (tracked where present, absent where not).

### Deferred Follow-ups

- **Guidance doc drift** — `packages/rpiv-pi/.rpiv/guidance/architecture.md:8` shows a module tree rooted at `rpiv-pi/` (standalone-repo era). Relative to the package root the tree is still correct, so it is deferred to Phase 2 rpiv-core extraction (when guidance docs naturally restructure to reflect the split). No Phase 1 edit.
- **CHANGELOG `[Unreleased]` footer anchor** — deliberately removed from `packages/rpiv-pi/CHANGELOG.md`. After the first rpiv-mono release creates `v0.6.1`, if the developer wants the anchor back, append `[Unreleased]: https://github.com/juicesharp/rpiv-mono/compare/v0.6.1...HEAD` plus `[0.6.1]: https://github.com/juicesharp/rpiv-mono/releases/tag/v0.6.1` to the footer. release.mjs does NOT maintain anchors.
- **`PACKAGE_ROOT` modernization** — per Decision 4, leave `agents.ts:27-31` as a three-dirname walk. Port to `new URL("./agents/", import.meta.url)` when Phase 2 nests code deeper.

### Backwards Compatibility

- npm install by name (`pi install npm:@juicesharp/rpiv-*`) continues to work — package names are unchanged, scope is unchanged.
- `~/.pi/agent/settings.json` detection (regex per `siblings.ts`) is version-agnostic and monorepo-transparent.
- Customers upgrading from rpiv-pi@0.6.0 to rpiv-pi@0.6.1 receive new lockstep-aligned siblings; `peerDependencies:"*"` means no resolver conflict.
- Source repos stay live with README pointers; old install snippets in external docs/blogs still resolve (same package names on npm).

## Pattern References

- `github.com/badlogic/pi-mono/scripts/release.mjs` — release pipeline structure (Unreleased promotion, lockstep version bump, local publish).
- `github.com/badlogic/pi-mono/scripts/sync-versions.js` — lockstep verifier + caret-range rewriter (`^<version>` for every matched intra-monorepo dep).
- `github.com/badlogic/pi-mono/package.json:version:*` scripts — `npm version <type> -ws --no-git-tag-version && node scripts/sync-versions.js && rm -rf node_modules … && npm install`.
- `github.com/badlogic/pi-mono/biome.json` — Biome config shape (tab indent, linter rule set, files.includes).
- `rpiv-pi/CHANGELOG.md:1-65` — Keep-a-Changelog format + hardcoded compare link footer pattern.
- `rpiv-pi/package.json:20` — `files` allowlist pattern (per-directory list) to replicate across all 6 packages.
- `rpiv-advisor/advisor.ts:137-140` + `rpiv-btw/btw.ts:77-80` — depth-agnostic `new URL("./prompts/…", import.meta.url)` pattern (referenced for future `PACKAGE_ROOT` port; not applied in Phase 1).

## Developer Context

### Research-inherited Q/As (fixed, not re-asked)

- **Publish pipeline** — pi-mono `release.mjs` over Changesets/status-quo.
- **rpiv-skillbased inclusion** — excluded; stays at truvis remote as CC-host reference.
- **Lockstep starting version** — align all at 0.6.0; first release 0.6.1.
- **Git history strategy** — fresh-init; source repos stay live (not archived at this stage).
- **Inter-package dep protocol** — caret ranges (`^0.6.0`) rewritten on publish by sync-versions.js clone.
- **rpiv-core extraction phasing** — Phase 2. Phase 1 preserves today's zero-cross-imports shape.

### Design-phase Q/As (this session)

**Q1 (architectural — GitHub repo destination, affects every per-package `repository.url`/`homepage`/`bugs.url` + every README banner URL + every CHANGELOG compare link)**:
A: **Fresh `juicesharp/rpiv-mono`.** Clean slate — avoids mixing rpiv-pi-only historical tags with new lockstep tags. Per-package manifest rewrites use this path.

**Q2 (operational — source-repo fate, affects transition UX for issue-filers)**:
A: **Live with README pointer, issues/PRs disabled.** Source repos stay live as forks-of-record. READMEs get a "Moved to juicesharp/rpiv-mono" block. Old raw.githubusercontent.com URLs continue to resolve during transition; new banner URLs in monorepo point at rpiv-mono.

**Q3 (architectural — Phase 1 CI scope, affects `.github/workflows/` presence)**:
A: **No CI in Phase 1.** Defer entirely. Pre-commit husky catches most issues locally; revisit when tests land.

**Q4 (code-shape — `PACKAGE_ROOT` at `agents.ts:27-31`, depth-agnostic port vs leave)**:
A: **Leave as-is.** Three-dirname walk verified working under `packages/rpiv-pi/`. Port only if a future refactor forces it; Phase 2 rpiv-core extraction is a natural trigger.

**Q5 (packaging contract — LICENSE file in per-package tarballs)**:
A: **Copy LICENSE into each package dir.** Preserves current shipping behavior for rpiv-pi/rpiv-btw; adds LICENSE to 4 siblings that currently lack one. 7 identical files in git (1 root + 6 per-package).

## Design History

- Slice 1: Root scaffolding — approved as generated
- Slice 2: Release tooling — approved as generated (release.mjs `addUnreleasedSection` regex adjusted during self-verify to handle Keep-a-Changelog intro prose)
- Slice 3: rpiv-pi package migration — approved as generated (added `repository.directory`; removed `[Unreleased]` footer anchor to avoid 404 window; old-version anchors kept pointing at source repo)
- Slice 4: 5 sibling packages migration — approved as generated (uniform template: URL rewrites + `repository.directory` added + version → 0.6.0 + `files` array normalized + CHANGELOG seeded + LICENSE copy where needed)

## References

- Research: `thoughts/shared/research/2026-04-18_09-23-09_rpiv-monorepo-consolidation.md`
- Questions: `thoughts/shared/questions/2026-04-18_08-45-45_rpiv-monorepo-consolidation.md`
- Prior forward-extraction research: `thoughts/shared/research/2026-04-13_16-11-41_extract-rpiv-core-tools-into-prerequisite-plugins.md`
- Prior forward-extraction plan: `thoughts/shared/plans/2026-04-13_17-52-15_extract-rpiv-plugins.md`
- Single-writer manifest constraint: `thoughts/shared/research/2026-04-16_11-39-33_extract-test-cases-sibling-plugin.md`
- pi-mono template — https://github.com/badlogic/pi-mono (branch: main)
  - `package.json` — https://github.com/badlogic/pi-mono/blob/main/package.json
  - `scripts/release.mjs` — https://github.com/badlogic/pi-mono/blob/main/scripts/release.mjs
  - `scripts/sync-versions.js` — https://github.com/badlogic/pi-mono/blob/main/scripts/sync-versions.js
  - `tsconfig.base.json` — https://github.com/badlogic/pi-mono/blob/main/tsconfig.base.json
  - `biome.json` — https://github.com/badlogic/pi-mono/blob/main/biome.json
  - `.gitignore` — https://github.com/badlogic/pi-mono/blob/main/.gitignore
  - `.husky/pre-commit` — https://github.com/badlogic/pi-mono/blob/main/.husky/pre-commit
