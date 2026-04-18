---
date: 2026-04-18T10:07:19-0400
planner: Claude Code
git_commit: ea7adc063a794e99d1cb0387b9a174e320d7b3d9
branch: main
repository: rpiv-pi
topic: "rpiv-mono Monorepo Consolidation (Phase 1)"
tags: [plan, monorepo, workspaces, rpiv-pi, siblings, release-pipeline, lockstep]
status: ready
design_source: "thoughts/shared/designs/2026-04-18_10-15-00_rpiv-monorepo-consolidation.md"
last_updated: 2026-04-18
last_updated_by: Claude Code
---

# rpiv-mono Monorepo Consolidation Implementation Plan

## Overview

Fresh-init a new `juicesharp/rpiv-mono` GitHub repo with a flat `packages/*` layout holding today's 6 Pi plugins verbatim (rpiv-pi + 5 siblings). Adopt pi-mono's `scripts/release.mjs` + `scripts/sync-versions.js` for a local-only lockstep publish pipeline, adapted to drop build/clean steps (Pi loads raw TypeScript). Phase 1 is mechanical-only: zero runtime behavior change, zero cross-package `dependencies` edges introduced.

See design artifact: `thoughts/shared/designs/2026-04-18_10-15-00_rpiv-monorepo-consolidation.md`.

## Desired End State

- Monorepo `juicesharp/rpiv-mono` exists with `packages/*` workspaces resolving all 6 plugins.
- `npm install` at root produces `node_modules/@juicesharp/rpiv-*` symlinks to each `packages/<name>/`.
- `node scripts/sync-versions.js` reports "All packages at same version (lockstep)" (0.6.0) with zero updates.
- `node scripts/release.mjs patch` is ready to cut the first lockstep release (0.6.1) end-to-end.
- Every customer install path (`pi install npm:@juicesharp/rpiv-*`) is unchanged; sibling detection regex in `siblings.ts` continues to work on `~/.pi/agent/settings.json`.
- `PACKAGE_ROOT` three-dirname walk at `extensions/rpiv-core/agents.ts:27-31` resolves to `packages/rpiv-pi/` under workspace-symlinked execution.
- Per-package tarballs (`npm pack` in each `packages/<name>/`) carry their declared `files` plus `LICENSE`.

Verification:

```bash
cd ~/rpiv-mono
rm -rf node_modules packages/*/node_modules package-lock.json && npm install
ls node_modules/@juicesharp/                         # 6 symlinks
node scripts/sync-versions.js                         # "All packages at same version"
( cd packages/rpiv-pi && npm pack --dry-run )         # lists declared files + LICENSE
npx biome check packages/
npx tsc --noEmit -p tsconfig.base.json
```

## What We're NOT Doing

- `rpiv-core` extraction — deferred to Phase 2 (extract `extensions/rpiv-core/` into its own package with `@juicesharp/rpiv-pi` depending on `@juicesharp/rpiv-core`). Phase 1 preserves today's zero-cross-imports shape.
- Test-skills extraction — deferred to Phase 3 if pursued.
- `.github/workflows/` — no CI in Phase 1. Pre-commit husky catches local issues; revisit when tests land.
- `PACKAGE_ROOT` modernization — three-dirname walk at `agents.ts:27-31` stays as-is. Port to `new URL("./agents/", import.meta.url)` only if a future refactor nests code deeper (natural Phase 2 trigger).
- `rpiv-skillbased` inclusion — out of scope; stays at its truvis remote as a Claude-Code-host reference.
- Source-repo archival — source repos stay live with README pointers (operational task, not implemented here).
- Root `CHANGELOG.md` — pi-mono has none; per-package CHANGELOGs are the contract.
- `dist/`, `tsconfig.build.json`, `vitest.config.ts`, `prepublishOnly: tsc -b`, `exports` maps, `build-binaries.yml` — rpiv-mono has no build (Pi loads raw `.ts` via `@mariozechner/jiti`).
- Nested example workspaces — pi-mono has some; rpiv-mono has none.
- `renovate` / `dependabot` — deferred.

---

## Phase 1: Root scaffold

### Overview

Create the monorepo root — workspaces manifest, shared tsc/biome configs, unified `.gitignore`, MIT LICENSE, README, and husky pre-commit hook. This is the foundation every later phase depends on. No `packages/*/` content is touched here; only root-level files.

### Changes Required:

#### 1. Root `package.json`
**File**: `/package.json`
**Changes**: NEW. Private monorepo manifest. Declares `workspaces: ["packages/*"]`, release scripts (`version:*`, `release:*`, `publish`, `publish:dry`), devDependencies (biome, husky, shx, typescript, @types/node), `prepare: husky`, Node ≥20 engine.

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

#### 2. Shared TypeScript config
**File**: `/tsconfig.base.json`
**Changes**: NEW. Strict ES2022 / Node16 config, `noEmit: true` (IDE typechecking only), `include: ["packages/*/**/*.ts"]`, excludes `node_modules`, `.pi`, `.rpiv`, `thoughts`. No per-package `tsconfig.json` in Phase 1 (siblings don't have them today).

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

#### 3. Shared Biome config
**File**: `/biome.json`
**Changes**: NEW. Biome 2.3.5 config — tab indent (width 3), line width 120, linter overrides copied from pi-mono (noNonNullAssertion off, useConst error, useNodejsImportProtocol off, noExplicitAny off). `files.includes` covers `packages/*/**/*.{ts,js}` + `scripts/**/*.{js,mjs}`.

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

#### 4. Unified gitignore
**File**: `/.gitignore`
**Changes**: NEW. Replaces divergent per-package copies. Does NOT ignore `.rpiv/`, `thoughts/`, or `package-lock.json`. Ignores `node_modules/`, `packages/*/node_modules/`, `.pi/`, logs, editor files, `.DS_Store`, `.env`.

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

#### 5. Root LICENSE
**File**: `/LICENSE`
**Changes**: NEW. Standard MIT with `Copyright (c) 2026 juicesharp`. Byte-identical content copied into each `packages/<name>/LICENSE` in Phase 3/4.

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

#### 6. Root README
**File**: `/README.md`
**Changes**: NEW. Monorepo overview, package roster table (6 packages with one-line descriptions + links), install snippets, development commands, release procedure example.

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

#### 7. Husky pre-commit hook
**File**: `/.husky/pre-commit`
**Changes**: NEW. Runs `npm run check` (biome + tsc --noEmit). Captures staged files before biome; restages any files biome autofixed. Adapted from pi-mono: drops browser-smoke branch.

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

### Success Criteria:

#### Automated Verification:
- [x] `npm install` at root completes with no errors
- [x] `ls node_modules/@juicesharp/` lists 6 entries (will only be true after Phase 3+4 land; in Phase 1 isolation, just verify `node_modules/` exists and no install errors)
- [x] `npx biome check .` exits 0 (no packages to lint yet — just config smoke) — biome 2.3.5 rejected `!**/<dir>/**` exclude patterns as warnings; dropped trailing `/**` per biome's safe-fix hint
- [ ] `npx tsc --noEmit -p tsconfig.base.json` exits 0 (no TS files to check yet — just config smoke) — fails with TS18003 in Phase 1 isolation. **Note (retrospective, added post-implementation):** the prediction that this "resolves naturally when Phase 3/4 add packages" was wrong. Peer packages declared as `peerDependencies: "*"` are not auto-installed by `npm install -ws`, so Phase 4's tsc criterion fails with TS2307 until `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui`, `@sinclair/typebox` are added as root `devDependencies`. If redoing Phase 1, add those to the root `package.json` devDependencies block upfront.
- [x] `test -x .husky/pre-commit` returns 0 (hook is executable)

#### Manual Verification:
- [x] `package.json` lists `workspaces: ["packages/*"]`
- [x] `.gitignore` does NOT include `thoughts/`, `.rpiv/`, or `package-lock.json`
- [x] LICENSE copyright line reads `Copyright (c) 2026 juicesharp`
- [x] README package roster links match design (6 packages, correct descriptions)

---

## Phase 2: Release tooling

### Overview

Port pi-mono's `release.mjs` + `sync-versions.js` scripts into `/scripts/`. Adapted: drop clean/build/browser-smoke steps (Pi loads raw TS); `release.mjs getVersion()` reads `packages/rpiv-pi/package.json`; `addUnreleasedSection()` regex inserts before first `## [` heading (survives Keep-a-Changelog intro prose in rpiv-pi CHANGELOG). `sync-versions.js` adopted verbatim modulo header comment.

Depends on Phase 1 (needs `packages/*` workspace structure + root `package.json` `version:*` scripts). Independent of Phase 3/4 — scripts iterate `packages/*` regardless of which packages exist.

### Changes Required:

#### 1. Lockstep release pipeline
**File**: `/scripts/release.mjs`
**Changes**: NEW. Usage: `node scripts/release.mjs <major|minor|patch|x.y.z>`. Sequence: uncommitted-changes guard → `npm run version:<type>` → promote `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD` in every `packages/*/CHANGELOG.md` → commit+tag → `npm publish -ws --access public` → reinstate `## [Unreleased]` block → commit → push main+tag.

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

#### 2. Lockstep verifier + caret-range rewriter
**File**: `/scripts/sync-versions.js`
**Changes**: NEW. Walks `packages/*/package.json`, enforces lockstep (errors on divergence), rewrites intra-monorepo `dependencies`/`devDependencies` to `^<current>`. Skips `peerDependencies:"*"` by design. No-op in Phase 1 (zero inter-package `dependencies`).

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

### Success Criteria:

#### Automated Verification:
- [x] `node scripts/sync-versions.js` exits 0 and prints "All packages at same version (lockstep)" with zero updates
- [x] `node scripts/release.mjs` with no args prints usage and exits 1
- [x] `node scripts/release.mjs garbage` exits 1 (rejects invalid target)
- [ ] `node scripts/release.mjs patch` dry-run (monkey-patch `npm publish` → `npm publish --dry-run`) on a throwaway branch completes end-to-end — deferred: packages/ is empty until Phase 3/4 land
- [x] Both scripts have node shebang (`#!/usr/bin/env node`)

#### Manual Verification:
- [x] `release.mjs` `getVersion()` reads `packages/rpiv-pi/package.json` (NOT `packages/ai/` from pi-mono template)
- [x] `addUnreleasedSection()` regex is `/^(## \[)/m` (inserts before first `## [` heading, survives intro prose)
- [x] `sync-versions.js` header comment references `@juicesharp/rpiv-*` (not pi-mono's scope)
- [x] `sync-versions.js` iterates `dependencies` and `devDependencies` only — NOT `peerDependencies`

---

## Phase 3: rpiv-pi package migration

### Overview

Rewrite `packages/rpiv-pi/package.json` repository/homepage/bugs URLs to `juicesharp/rpiv-mono` (add `repository.directory: packages/rpiv-pi`). Rewrite footer compare/release anchors in `packages/rpiv-pi/CHANGELOG.md` (lines 62-65): remove `[Unreleased]` anchor (would 404 until first rpiv-mono release); keep old-version anchors pointing at source repo (tags resolvable; source repo stays live per Decision 2). Version stays 0.6.0. `files` / `pi` / `peerDependencies` unchanged.

Rpiv-pi source tree (`extensions/`, `skills/`, `agents/`, `scripts/migrate.js`, `README.md`, `LICENSE`, `.rpiv/`) moves unchanged from `rpiv-pi/` to `packages/rpiv-pi/` via `git mv` — no edit step needed beyond this phase's 2 files. That movement is a pre-phase operational step captured in Migration Notes.

Depends on Phase 1 (needs `packages/*` resolved by root workspaces). Independent of Phase 2 and Phase 4.

### Changes Required:

#### 1. rpiv-pi package manifest
**File**: `packages/rpiv-pi/package.json`
**Changes**: MODIFY. `repository.url` → `git+https://github.com/juicesharp/rpiv-mono.git`; add `repository.directory: "packages/rpiv-pi"`; `homepage` → `https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-pi#readme`; `bugs.url` → `https://github.com/juicesharp/rpiv-mono/issues`. Version unchanged (0.6.0). `files`, `pi`, `peerDependencies` byte-identical to today.

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

#### 2. rpiv-pi CHANGELOG footer
**File**: `packages/rpiv-pi/CHANGELOG.md` (lines 62-65)
**Changes**: MODIFY. Lines 1-61 preserved byte-identical. Replace 4-line anchor block with 3 lines (remove `[Unreleased]` anchor). Old-version anchors still point at `juicesharp/rpiv-pi/releases/tag/*` — source repo stays live per Decision 2.

```markdown
[0.6.0]: https://github.com/juicesharp/rpiv-pi/releases/tag/v0.6.0
[0.5.1]: https://github.com/juicesharp/rpiv-pi/releases/tag/v0.5.1
[0.5.0]: https://github.com/juicesharp/rpiv-pi/releases/tag/v0.5.0
```

### Success Criteria:

#### Automated Verification:
- [x] `jq -r .repository.url packages/rpiv-pi/package.json` prints `git+https://github.com/juicesharp/rpiv-mono.git`
- [x] `jq -r .repository.directory packages/rpiv-pi/package.json` prints `packages/rpiv-pi`
- [x] `jq -r .version packages/rpiv-pi/package.json` prints `0.6.0`
- [x] `grep -c "juicesharp/rpiv-pi" packages/rpiv-pi/package.json` returns 0 (no residual standalone-repo URLs in manifest) — only match is the package `name` field `@juicesharp/rpiv-pi`; all URLs now point at `rpiv-mono`
- [x] `cd packages/rpiv-pi && npm pack --dry-run` lists `extensions/`, `skills/`, `agents/`, `scripts/`, `README.md`, `LICENSE` — no stray `docs/`, `thoughts/`, `.pi/`, `node_modules/`
- [x] `grep -c "^## \[Unreleased\]" packages/rpiv-pi/CHANGELOG.md` returns 1
- [x] `grep "^\[Unreleased\]:" packages/rpiv-pi/CHANGELOG.md` returns no matches (anchor removed)

#### Manual Verification:
- [x] `packages/rpiv-pi/CHANGELOG.md` lines 1-61 byte-identical to source `rpiv-pi/CHANGELOG.md`
- [x] `files` array unchanged from source: `["extensions/", "skills/", "agents/", "scripts/", "README.md", "LICENSE"]`
- [x] `peerDependencies` unchanged (7 entries, all `"*"`)
- [x] Running `node --input-type=module -e 'import { fileURLToPath } from "node:url"; import { dirname } from "node:path"; const f = new URL("extensions/rpiv-core/agents.ts", "file://" + process.cwd() + "/"); console.log(dirname(dirname(dirname(fileURLToPath(f)))))'` from `packages/rpiv-pi/` prints the package root (validates three-dirname walk in `agents.ts:27-31`)

---

## Phase 4: Sibling packages migration

### Overview

Apply uniform template to each of the 5 siblings: rewrite `repository.url`/`homepage`/`bugs.url` → `juicesharp/rpiv-mono` (add `repository.directory`), bump version 0.1.x → 0.6.0, normalize `files` array (create for 2 siblings that lack one; add `"LICENSE"` for 2 siblings missing it; no-op for rpiv-btw which already has both), rewrite README banner URL (single line per sibling), seed `CHANGELOG.md` (Keep-a-Changelog scaffold + `[Unreleased]` + `[0.6.0] — 2026-04-18` consolidation entry), add `LICENSE` (byte-identical copy of root LICENSE) where absent.

Per-sibling matrix:

| Sibling | package.json | README line | CHANGELOG | LICENSE | Files in this phase |
|---|---|---|---|---|---|
| rpiv-advisor | URL + v0.6.0 + LICENSE in files | 8 | NEW | NEW | 4 |
| rpiv-ask-user-question | URL + v0.6.0 + new files array | 7 | NEW | NEW | 4 |
| rpiv-btw | URL + v0.6.0 | 8 | NEW | EXISTS (no edit) | 3 |
| rpiv-todo | URL + v0.6.0 + LICENSE in files | 7 | NEW | NEW | 4 |
| rpiv-web-tools | URL + v0.6.0 + new files array | 7 | NEW | NEW | 4 |

Total: 19 files across 5 packages, uniform template.

Depends on Phase 1. Independent of Phase 2 and Phase 3. Within Phase 4, siblings have no interdependencies — can apply in any order.

Source trees (`index.ts`, `*.ts`, `prompts/`, `docs/`) move unchanged via `git mv` as a pre-phase operational step captured in Migration Notes.

### Changes Required:

#### 1. rpiv-advisor (4 files)

**File**: `packages/rpiv-advisor/package.json`
**Changes**: MODIFY. URLs → rpiv-mono. `repository.directory: "packages/rpiv-advisor"`. Version 0.1.3 → 0.6.0. `"LICENSE"` appended to existing `files` array.

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

**File**: `packages/rpiv-advisor/README.md` (line 8)
**Changes**: MODIFY. Banner URL `raw.githubusercontent.com/juicesharp/rpiv-advisor/main/docs/advisor.jpg` → `raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-advisor/docs/advisor.jpg`. All other README content byte-identical.

```markdown
![Advisor model selector](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-advisor/docs/advisor.jpg)
```

**File**: `packages/rpiv-advisor/CHANGELOG.md`
**Changes**: NEW. Keep-a-Changelog scaffold + `[Unreleased]` + `[0.6.0] — 2026-04-18` consolidation entry.

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

**File**: `packages/rpiv-advisor/LICENSE`
**Changes**: NEW. Byte-identical copy of `/LICENSE`.

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

#### 2. rpiv-ask-user-question (4 files)

**File**: `packages/rpiv-ask-user-question/package.json`
**Changes**: MODIFY. URLs → rpiv-mono. `repository.directory` added. Version 0.1.4 → 0.6.0. `files` array CREATED (previously absent): `["index.ts", "ask-user-question.ts", "wrapping-select.ts", "README.md", "LICENSE"]`.

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

**File**: `packages/rpiv-ask-user-question/README.md` (line 7)
**Changes**: MODIFY. Banner URL rewritten.

```markdown
![Structured question prompt](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-ask-user-question/docs/prompt.jpg)
```

**File**: `packages/rpiv-ask-user-question/CHANGELOG.md`
**Changes**: NEW. Scaffold + consolidation entry.

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

**File**: `packages/rpiv-ask-user-question/LICENSE`
**Changes**: NEW. Byte-identical copy of `/LICENSE`.

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

#### 3. rpiv-btw (3 files)

**File**: `packages/rpiv-btw/package.json`
**Changes**: MODIFY. URLs → rpiv-mono. `repository.directory` added. Version 0.1.1 → 0.6.0. `files` array unchanged (already includes `"LICENSE"`).

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

**File**: `packages/rpiv-btw/README.md` (line 8)
**Changes**: MODIFY. Banner URL rewritten.

```markdown
![The /btw side-question panel at the bottom of the Pi terminal](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-btw/docs/overlay.jpg)
```

**File**: `packages/rpiv-btw/CHANGELOG.md`
**Changes**: NEW. Scaffold + consolidation entry.

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

(rpiv-btw/LICENSE moves unchanged from source — not edited in this phase.)

#### 4. rpiv-todo (4 files)

**File**: `packages/rpiv-todo/package.json`
**Changes**: MODIFY. URLs → rpiv-mono. `repository.directory` added. Version 0.1.2 → 0.6.0. `"LICENSE"` appended to existing `files` array.

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

**File**: `packages/rpiv-todo/README.md` (line 7)
**Changes**: MODIFY. Banner URL rewritten.

```markdown
![Todo overlay widget above the Pi editor](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-todo/docs/overlay.jpg)
```

**File**: `packages/rpiv-todo/CHANGELOG.md`
**Changes**: NEW. Scaffold + consolidation entry.

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

**File**: `packages/rpiv-todo/LICENSE`
**Changes**: NEW. Byte-identical copy of `/LICENSE`.

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

#### 5. rpiv-web-tools (4 files)

**File**: `packages/rpiv-web-tools/package.json`
**Changes**: MODIFY. URLs → rpiv-mono. `repository.directory` added. Version 0.1.2 → 0.6.0. `files` array CREATED (previously absent): `["index.ts", "README.md", "LICENSE"]`.

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

**File**: `packages/rpiv-web-tools/README.md` (line 7)
**Changes**: MODIFY. Banner URL rewritten.

```markdown
![Brave Search API key prompt](https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-web-tools/docs/config.jpg)
```

**File**: `packages/rpiv-web-tools/CHANGELOG.md`
**Changes**: NEW. Scaffold + consolidation entry.

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

**File**: `packages/rpiv-web-tools/LICENSE`
**Changes**: NEW. Byte-identical copy of `/LICENSE`.

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

### Success Criteria:

#### Automated Verification:
- [x] `for p in rpiv-advisor rpiv-ask-user-question rpiv-btw rpiv-todo rpiv-web-tools; do jq -r .version packages/$p/package.json; done` prints `0.6.0` five times
- [x] `for p in rpiv-advisor rpiv-ask-user-question rpiv-btw rpiv-todo rpiv-web-tools; do jq -r .repository.directory packages/$p/package.json; done` prints `packages/<name>` for each
- [x] `for p in rpiv-advisor rpiv-ask-user-question rpiv-btw rpiv-todo rpiv-web-tools; do jq -e '.files | contains(["LICENSE"])' packages/$p/package.json; done` exits 0 for all 5
- [x] `grep -l "raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/" packages/*/README.md | wc -l` returns 5
- [x] `grep -r "raw.githubusercontent.com/juicesharp/rpiv-\(advisor\|ask-user-question\|btw\|todo\|web-tools\)/main/" packages/ | wc -l` returns 0 (no stale standalone-repo banner URLs)
- [x] `for p in rpiv-advisor rpiv-ask-user-question rpiv-btw rpiv-todo rpiv-web-tools; do test -f packages/$p/CHANGELOG.md; done` exits 0 for all 5
- [x] `grep -c "^## \[Unreleased\]" packages/{rpiv-advisor,rpiv-ask-user-question,rpiv-btw,rpiv-todo,rpiv-web-tools}/CHANGELOG.md` returns 1 per file
- [x] `for p in rpiv-advisor rpiv-ask-user-question rpiv-todo rpiv-web-tools; do test -f packages/$p/LICENSE; done` exits 0 (4 new LICENSEs; rpiv-btw already has one)
- [x] `cd packages/<each-sibling> && npm pack --dry-run` lists each `files`-declared path + `LICENSE`; no stray `docs/`, `.pi/`, `thoughts/`
- [x] `npx biome check packages/` exits 0 — required running `biome check --write [--unsafe]` once to fix pre-existing format/lint drift in sibling sources (`useTemplate`, `organizeImports`, tab width, `useOptionalChain`); one unsafe `noConfusingVoidType` rewrite regressed `rpiv-btw/btw-ui.ts` `done: (result?: undefined) => void` and was hand-adjusted; one pre-existing `noAssignInExpressions` in `rpiv-pi/extensions/rpiv-core/pi-installer.ts` was refactored to block bodies
- [x] `npx tsc --noEmit -p tsconfig.base.json` exits 0 — required two follow-ups beyond Phase 4 scope: (1) added `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui`, `@sinclair/typebox` as root devDependencies so peers resolve; (2) patched sibling-source API drift against `pi-coding-agent@0.67.68` — removed 3 dead `result.isError` branches in `renderResult` callbacks (`rpiv-todo/todo.ts`, `rpiv-web-tools/index.ts`), added missing `details` field to 2 `onUpdate?.({...})` partial results, and replaced one `return { isError, content, details }` error path with a thrown error (per new contract: "Throw on failure instead of encoding errors in `content`")

#### Manual Verification:
- [x] Each new LICENSE byte-identical to root `/LICENSE` (`for p in rpiv-advisor rpiv-ask-user-question rpiv-todo rpiv-web-tools; do diff -q LICENSE packages/$p/LICENSE; done`)
- [x] Each sibling CHANGELOG consolidation entry states the original 0.1.x version (per-sibling: advisor 0.1.3, ask-user-question 0.1.4, btw 0.1.1, todo 0.1.2, web-tools 0.1.2)
- [x] rpiv-btw `files` array NOT modified (already had `"LICENSE"`)
- [x] rpiv-ask-user-question + rpiv-web-tools `files` arrays CREATED (previously absent)
- [ ] Running Pi from `packages/rpiv-pi/`: `/rpiv-setup` reports all 5 siblings as installed (workspace symlinks resolvable by `~/.pi/agent/settings.json` regex) — deferred: requires a live Pi session to verify

---

## Testing Strategy

### Automated:

- `npm install` at monorepo root — clean exit, 6 symlinks under `node_modules/@juicesharp/`.
- `node scripts/sync-versions.js` — prints "All packages at same version (lockstep)" with zero updates.
- `npx biome check .` and `npx tsc --noEmit -p tsconfig.base.json` — both exit 0.
- `cd packages/<each-package> && npm pack --dry-run` — each tarball lists declared `files` + `LICENSE`, no strays (`docs/`, `thoughts/`, `.pi/`, `node_modules/`).
- `node scripts/release.mjs patch` on a throwaway branch with `npm publish` monkey-patched to `npm publish --dry-run` — completes end-to-end (version bump → CHANGELOG promotion → commit → tag → dry-run publish → reinstate `[Unreleased]` → commit).
- `grep -c "## \[Unreleased\]" packages/*/CHANGELOG.md` — returns 6 (release.mjs skips packages missing the anchor).

### Manual Testing Steps:

1. **Workspace symlink sanity**: `rm -rf node_modules packages/*/node_modules package-lock.json && npm install && ls -la node_modules/@juicesharp/` — confirm 6 symlinks each pointing at the correct `packages/<name>/`.
2. **PACKAGE_ROOT walk**: from `packages/rpiv-pi/`, run the Node snippet from the design's Verification Notes — confirms the three-dirname walk lands on the package root.
3. **Pi session smoke**: `cd packages/rpiv-pi && pi`, invoke `/rpiv-setup` — confirm all 5 siblings are reported as installed (depends on maintainer's local `~/.pi/agent/settings.json`; workspace symlinks in `node_modules/@juicesharp/` should satisfy the regex detection).
4. **Banner URL resolution**: after first push to `juicesharp/rpiv-mono:main`, `curl -I https://raw.githubusercontent.com/juicesharp/rpiv-mono/main/packages/rpiv-advisor/docs/advisor.jpg` — expect 200.
5. **Dry-run publish end-to-end**: on a throwaway branch with `npm publish` monkey-patched, run `node scripts/release.mjs patch` and verify: version bumped to 0.6.1 in every `packages/*/package.json`, every `CHANGELOG.md` promoted, commit+tag created, `[Unreleased]` reinstated.

## Performance Considerations

Not applicable — monorepo consolidation has no runtime performance implications.

Install-time notes:

- `npm install` at monorepo root is strictly faster than 6 separate clones + installs (deduplicated deps, single lockfile).
- Pi load path is unchanged; no additional indirection at session start.

## Migration Notes

### Pre-phase operational steps

These are not file edits and not tracked as plan phases, but implementers must do them before/during Phase 3 and Phase 4:

1. **Create empty `juicesharp/rpiv-mono` GitHub repo**.
2. **Fresh-init local `~/rpiv-mono/`** and apply Phase 1 + Phase 2.
3. **Copy source trees unchanged** (per File Movement Manifest below) into `packages/<name>/` before running Phase 3 / Phase 4 edits.
4. **Preflight `npm pack`** per package after Phase 4; inspect each tarball.
5. **Git commit** Phases 1-4 as one consolidation commit: `"Initial monorepo consolidation (v0.6.0 lockstep)"`.
6. **Push to remote**: `git remote add origin git@github.com:juicesharp/rpiv-mono.git && git push -u origin main`.
7. **First lockstep release**: `node scripts/release.mjs patch` → v0.6.1.
8. **Post-release**: update each source repo's `README.md` with "Moved to juicesharp/rpiv-mono" pointer; disable issues/PRs via repo settings.

### File Movement Manifest

Files that move unchanged from source repos into `packages/<name>/`. Not listed in any phase's Changes Required — pure copies tracked only here.

- `rpiv-pi/` → `packages/rpiv-pi/`: `extensions/`, `skills/`, `agents/`, `scripts/migrate.js`, `README.md`, `LICENSE`, `.rpiv/`
- `rpiv-advisor/` → `packages/rpiv-advisor/`: `index.ts`, `advisor.ts`, `advisor-ui.ts`, `prompts/`, `docs/`
- `rpiv-ask-user-question/` → `packages/rpiv-ask-user-question/`: `index.ts`, `ask-user-question.ts`, `wrapping-select.ts`, `docs/`
- `rpiv-btw/` → `packages/rpiv-btw/`: `index.ts`, `btw.ts`, `btw-ui.ts`, `prompts/`, `docs/`, `LICENSE`
- `rpiv-todo/` → `packages/rpiv-todo/`: `index.ts`, `todo.ts`, `todo-overlay.ts`, `docs/`
- `rpiv-web-tools/` → `packages/rpiv-web-tools/`: `index.ts`, web-tools source files, `docs/`
- `rpiv-pi/thoughts/` → `/thoughts/` (monorepo root)

Per-repo `.gitignore`, `package-lock.json`, and `node_modules/` do NOT migrate — unified `.gitignore` at root replaces them; `npm install` at root regenerates `package-lock.json`.

### Rollback Strategy

If the first `release.mjs patch` fails mid-flow:

- **Before publish**: `git reset --hard HEAD~2` (reverts Release commit + Add-[Unreleased] commit); `git tag -d v0.6.1`; no upstream state to reconcile.
- **After publish, before tag push**: npm has the packages; delete local tag; do NOT push. Resolve the blocking issue manually, then re-run just the tag-push and [Unreleased] commit steps.
- **After tag push**: irreversible; fix forward with v0.6.2 carrying the correction.
- Customers are insulated — rollback affects maintainer workflow only. Package names and sibling regex detection are untouched by any release flow.

### Backwards Compatibility

- `pi install npm:@juicesharp/rpiv-*` continues to work — package names and scope unchanged.
- `~/.pi/agent/settings.json` detection (regex per `siblings.ts`) is version-agnostic and monorepo-transparent.
- Customers upgrading from rpiv-pi@0.6.0 to rpiv-pi@0.6.1 receive new lockstep-aligned siblings; `peerDependencies:"*"` means no resolver conflict.
- Source repos stay live with README pointers; old install snippets in external docs/blogs still resolve (same package names on npm).
- Customers pinned to `^0.1.x` on any sibling will NOT auto-upgrade to 0.6.0+ — intentional (the jump is a signal, not a silent upgrade). 0.1.x versions remain on npm.

### Deferred Follow-ups

- **Guidance doc drift** — `packages/rpiv-pi/.rpiv/guidance/architecture.md:8` shows a module tree rooted at `rpiv-pi/` (standalone-repo era). Relative to the package root the tree is still correct; deferred to Phase 2 rpiv-core extraction.
- **CHANGELOG `[Unreleased]` footer anchor** — deliberately removed from `packages/rpiv-pi/CHANGELOG.md`. After first rpiv-mono release creates `v0.6.1`, append back `[Unreleased]: https://github.com/juicesharp/rpiv-mono/compare/v0.6.1...HEAD` plus `[0.6.1]: https://github.com/juicesharp/rpiv-mono/releases/tag/v0.6.1` if the maintainer wants it. `release.mjs` does NOT maintain anchors.
- **`PACKAGE_ROOT` modernization** — leave `agents.ts:27-31` as a three-dirname walk. Port to `new URL("./agents/", import.meta.url)` when Phase 2 nests code deeper.

## References

- Design: `thoughts/shared/designs/2026-04-18_10-15-00_rpiv-monorepo-consolidation.md`
- Research: `thoughts/shared/research/2026-04-18_09-23-09_rpiv-monorepo-consolidation.md`
- Research questions: `thoughts/shared/questions/2026-04-18_08-45-45_rpiv-monorepo-consolidation.md`
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
