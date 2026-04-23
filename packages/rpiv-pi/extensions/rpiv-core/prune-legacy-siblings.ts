/**
 * Remove deprecated sibling package entries from ~/.pi/agent/settings.json.
 *
 * Runs at the top of /rpiv-setup so 0.11.x → 0.12.0 upgraders don't end up
 * with both @tintinweb/pi-subagents and pi-subagents loaded side-by-side
 * (which crashes Pi's subagent dispatch — the tintinweb tools blow up with
 * `path argument must be of type string. Received undefined`).
 *
 * Fail-soft: missing file / invalid JSON / non-object / unwritable → silent
 * no-op. Idempotent: re-running with no legacy entries returns { pruned: [] }.
 * Pure utility — no plugin API dependency.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { LEGACY_SIBLINGS } from "./siblings.js";

const PI_AGENT_SETTINGS = join(homedir(), ".pi", "agent", "settings.json");

export interface PruneLegacySiblingsResult {
	/** settings.json `packages[]` entries that were removed (empty = no-op). */
	pruned: string[];
}

/**
 * Remove LEGACY_SIBLINGS entries from the user's Pi settings.json.
 * Returns a structured report so callers can emit a conditional notify.
 * Never throws.
 */
export function pruneLegacySiblings(): PruneLegacySiblingsResult {
	if (!existsSync(PI_AGENT_SETTINGS)) return { pruned: [] };

	let parsed: unknown;
	try {
		const raw = readFileSync(PI_AGENT_SETTINGS, "utf-8");
		parsed = JSON.parse(raw);
	} catch {
		return { pruned: [] };
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { pruned: [] };
	}
	const settings = parsed as Record<string, unknown>;
	if (!Array.isArray(settings.packages)) return { pruned: [] };

	const pruned: string[] = [];
	const keptPackages = (settings.packages as unknown[]).filter((entry) => {
		if (typeof entry !== "string") return true;
		const isLegacy = LEGACY_SIBLINGS.some((l) => l.matches.test(entry));
		if (isLegacy) pruned.push(entry);
		return !isLegacy;
	});

	if (pruned.length === 0) return { pruned: [] };

	settings.packages = keptPackages;
	try {
		writeFileSync(PI_AGENT_SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
	} catch {
		return { pruned: [] };
	}
	return { pruned };
}
