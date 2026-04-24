/**
 * rpiv-args — core logic.
 *
 * Intercepts `/skill:<name> <args>` at the input hook and emits a byte-exact
 * Pi skill wrapper with opt-in $N/$ARGUMENTS/$@/${@:N[:L]} substitution on
 * the body. Falls through (returns {action:"continue"}) when the text is not
 * a skill command, the skill is unknown, or the body contains no tokens —
 * keeping Pi's built-in behavior 100% intact for today's 17 rpiv-pi skills.
 *
 * Byte-exact wrapper requirement: parseSkillBlock regex at
 * node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js:40
 * is the load-bearing contract. Do not reformat the template literal below.
 */

import { readFileSync } from "node:fs";
import {
	type ExtensionAPI,
	type InputEvent,
	type InputEventResult,
	loadSkills,
	parseFrontmatter,
	type Skill,
	stripFrontmatter,
} from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Matches any placeholder Pi's substituteArgs would replace. Used as the
 *  opt-in gate: absent → pass through verbatim (D2). */
const TOKEN_REGEX = /\$(?:\d+|ARGUMENTS|@|\{@:\d+(?::\d+)?\})/;

/** Prefix Pi uses (`agent-session.js:829`). Single-space tokenisation (D7). */
const SKILL_PREFIX = "/skill:";

/** Re-entrancy guard (D8). */
const WRAPPED_PREFIX = "<skill ";

// ---------------------------------------------------------------------------
// Tokeniser — byte-equivalent to Pi's parseCommandArgs at
// node_modules/@mariozechner/pi-coding-agent/dist/core/prompt-templates.js:11-42
// ---------------------------------------------------------------------------

export function parseCommandArgs(argsString: string): string[] {
	const args: string[] = [];
	let current = "";
	let inQuote: string | null = null;
	for (let i = 0; i < argsString.length; i++) {
		const char = argsString[i];
		if (inQuote) {
			if (char === inQuote) {
				inQuote = null;
			} else {
				current += char;
			}
		} else if (char === '"' || char === "'") {
			inQuote = char;
		} else if (char === " " || char === "\t") {
			if (current) {
				args.push(current);
				current = "";
			}
		} else {
			current += char;
		}
	}
	if (current) args.push(current);
	return args;
}

// ---------------------------------------------------------------------------
// Substitutor — byte-equivalent to Pi's substituteArgs at
// node_modules/@mariozechner/pi-coding-agent/dist/core/prompt-templates.js:54-82
// Order matters: $N first, then ${@:N[:L]}, then $ARGUMENTS, then $@.
// ---------------------------------------------------------------------------

export function substituteArgs(content: string, args: string[]): string {
	let result = content;
	result = result.replace(/\$(\d+)/g, (_, num) => args[parseInt(num, 10) - 1] ?? "");
	result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_, startStr, lengthStr) => {
		let start = parseInt(startStr, 10) - 1;
		if (start < 0) start = 0;
		if (lengthStr) {
			const length = parseInt(lengthStr, 10);
			return args.slice(start, start + length).join(" ");
		}
		return args.slice(start).join(" ");
	});
	const allArgs = args.join(" ");
	result = result.replace(/\$ARGUMENTS/g, allArgs);
	result = result.replace(/\$@/g, allArgs);
	return result;
}

// ---------------------------------------------------------------------------
// Skill-path index — populated once, refreshed on session_start(reason:reload)
// ---------------------------------------------------------------------------

interface SkillIndexEntry {
	readonly name: string;
	readonly filePath: string;
	readonly baseDir: string;
}

let skillIndex: Map<string, SkillIndexEntry> | null = null;

export function invalidateSkillIndex(): void {
	skillIndex = null;
}

/** Build the name→path index by asking Pi for its currently-loaded skills. */
function buildSkillIndex(): Map<string, SkillIndexEntry> {
	const { skills } = loadSkills({
		cwd: process.cwd(),
		skillPaths: [],
		includeDefaults: true,
	});
	const index = new Map<string, SkillIndexEntry>();
	for (const s of skills as Skill[]) {
		index.set(s.name, { name: s.name, filePath: s.filePath, baseDir: s.baseDir });
	}
	return index;
}

function getSkillIndex(): Map<string, SkillIndexEntry> {
	if (!skillIndex) skillIndex = buildSkillIndex();
	return skillIndex;
}

// ---------------------------------------------------------------------------
// Wrapper emit — byte-exact against parseSkillBlock regex at
// node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js:40
// and byte-equivalent to _expandSkillCommand's output at :840-841.
// ---------------------------------------------------------------------------

function buildSkillBlock(entry: SkillIndexEntry, body: string): string {
	return `<skill name="${entry.name}" location="${entry.filePath}">\nReferences are relative to ${entry.baseDir}.\n\n${body}\n</skill>`;
}

function appendArgs(skillBlock: string, args: string): string {
	return args ? `${skillBlock}\n\n${args}` : skillBlock;
}

// ---------------------------------------------------------------------------
// Input handler
// ---------------------------------------------------------------------------

export function handleInput(event: InputEvent): InputEventResult {
	const text = event.text;

	// D8 re-entrancy: already-wrapped text (from our own or any other
	// extension's {action:"transform"}) passes through untouched.
	if (text.startsWith(WRAPPED_PREFIX)) return { action: "continue" };

	if (!text.startsWith(SKILL_PREFIX)) return { action: "continue" };

	// D7 single-space tokenisation — byte-match Pi's indexOf(" ") at :831.
	const spaceIndex = text.indexOf(" ");
	const skillName = spaceIndex === -1 ? text.slice(SKILL_PREFIX.length) : text.slice(SKILL_PREFIX.length, spaceIndex);
	const argsString = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();

	const entry = getSkillIndex().get(skillName);
	if (!entry) return { action: "continue" }; // unknown skill — let Pi handle it

	let content: string;
	try {
		content = readFileSync(entry.filePath, "utf-8");
	} catch {
		return { action: "continue" }; // let Pi emit its error via _expandSkillCommand
	}

	const { frontmatter } = parseFrontmatter<{ "argument-hint"?: string }>(content);
	void frontmatter; // informational only in v1 — D3
	const body = stripFrontmatter(content).trim();

	// D2 opt-in gate: if body has no token, emit byte-identical to Pi's :841.
	if (!TOKEN_REGEX.test(body)) {
		return { action: "transform", text: appendArgs(buildSkillBlock(entry, body), argsString) };
	}

	const parsed = parseCommandArgs(argsString);
	const substituted = substituteArgs(body, parsed);
	return { action: "transform", text: appendArgs(buildSkillBlock(entry, substituted), argsString) };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerArgsHandler(pi: ExtensionAPI): void {
	pi.on("input", (event) => handleInput(event));
	pi.on("session_start", (event) => {
		if (event.reason === "reload" || event.reason === "startup") {
			invalidateSkillIndex();
		}
	});
}
