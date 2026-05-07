# Changelog

All notable changes to `@juicesharp/rpiv-site` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `scope-tracer` agent and `/skill:changelog` skill listed on the agents and skills pages with updated visitor copy.
- Version imprint in the top nav (between brand and section counter) and a quiet “EDITION · vX.Y.Z” line below the colophon rail. Both read from a single `lib/version.ts` that imports the lockstep version from `rpiv-pi/package.json` — the next release bump propagates automatically with zero hand edits. Nav imprint links to the pinned-version page on npm.

### Fixed
- X social card switched to summary + square logo for reliable preview rendering on low-engagement domains.
- Nav version imprint aligned on the same typographic baseline as the brand mark at desktop viewports.

## [1.1.5] - 2026-05-05
