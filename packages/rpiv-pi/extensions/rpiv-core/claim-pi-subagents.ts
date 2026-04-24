/**
 * Strip `"npm:pi-subagents"` from `~/.pi/agent/settings.json#packages` so
 * nicobailon's pi-subagents loads exactly once — through the proxy in
 * subagent-widget/renderer-override.ts — and not a second time as a
 * peer package. Without this, both loaders register handlers and the
 * quiet renderResult is only applied to our copy (pi's `first-wins`
 * tool registry hides the effect).
 *
 * User-wins: untouched if `packages[]` is missing or if the entry is
 * not present. Fail-soft on filesystem/JSON errors.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_AGENT_SETTINGS = join(homedir(), ".pi", "agent", "settings.json");
const ENTRY = "npm:pi-subagents";

export interface ClaimPiSubagentsResult {
	/** True iff this call removed the entry. False if already absent. */
	claimed: boolean;
}

export function claimPiSubagents(): ClaimPiSubagentsResult {
	if (!existsSync(PI_AGENT_SETTINGS)) return { claimed: false };

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(PI_AGENT_SETTINGS, "utf-8"));
	} catch {
		return { claimed: false };
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { claimed: false };
	}
	const settings = parsed as Record<string, unknown>;
	const packages = settings.packages;
	if (!Array.isArray(packages)) return { claimed: false };

	const before = packages.length;
	const next = packages.filter((p) => p !== ENTRY);
	if (next.length === before) return { claimed: false };

	settings.packages = next;
	try {
		writeFileSync(PI_AGENT_SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
	} catch {
		return { claimed: false };
	}
	return { claimed: true };
}
