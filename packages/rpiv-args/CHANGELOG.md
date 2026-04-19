# Changelog

All notable changes to `@juicesharp/rpiv-args` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.3] - 2026-04-19

### Added
- Initial release. New sibling Pi extension that intercepts `/skill:<name> <args>` via the `input` hook and pre-emptively wraps the skill body in a `<skill …>…</skill>` block with opt-in `$N` / `$ARGUMENTS` / `$@` / `${@:N[:L]}` substitution. Byte-exact match of Pi's `parseSkillBlock` regex so downstream consumers (including `@tintinweb/pi-subagents`) round-trip cleanly. Zero-migration: bodies with no placeholders fall through to Pi's existing append-verbatim behavior.
