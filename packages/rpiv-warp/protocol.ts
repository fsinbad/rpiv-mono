/**
 * rpiv-warp — Warp terminal detection + protocol negotiation.
 *
 * Pure functions only. No module-level mutable state. Each function does
 * one thing; `detectWarpEnvironment` is the composition site.
 *
 * Env vars consulted (read fresh on every call — no cache):
 *   TERM_PROGRAM                       — must be "WarpTerminal"
 *   WARP_CLI_AGENT_PROTOCOL_VERSION    — required for structured emission
 *   WARP_CLIENT_VERSION                — used for per-channel broken-version gating
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structured event names emitted in the OSC 777 payload's `event` field. */
export type WarpEvent = "session_start" | "stop" | "idle_prompt" | "tool_complete";

/** Warp release channel — present in every `WARP_CLIENT_VERSION` literal. */
export type Channel = "stable" | "preview" | "dev";

/** Parsed version components: [year, month, day, hour, minute, rev, seq]. */
export type VersionTuple = readonly [number, number, number, number, number, number, number];

export interface ParsedWarpVersion {
	readonly tuple: VersionTuple;
	readonly channel: Channel;
}

export interface WarpEnvironment {
	readonly isWarp: boolean;
	readonly supportsStructured: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Plugin's protocol version — Warp's negotiator picks min(plugin, warp). */
export const PROTOCOL_VERSION = 1;

/**
 * Last broken Warp build per channel. Builds at-or-below the threshold
 * advertise structured-protocol support but render notifications behind a
 * feature flag — gate them off until users upgrade.
 */
export const BROKEN_VERSIONS: Record<Channel, VersionTuple | null> = {
	stable: [2026, 3, 25, 8, 24, 5, 5],
	preview: [2026, 3, 25, 8, 24, 5, 5],
	dev: null,
};

const VERSION_RE = /^v0\.(\d{4})\.(\d{1,2})\.(\d{1,2})\.(\d{1,2})\.(\d{1,2})\.(stable|preview|dev)_(\d+)$/;

// ---------------------------------------------------------------------------
// Env-var primitives — each reads exactly one variable
// ---------------------------------------------------------------------------

export function isWarpTerminal(): boolean {
	return process.env.TERM_PROGRAM === "WarpTerminal";
}

export function hasStructuredProtocol(): boolean {
	const v = process.env.WARP_CLI_AGENT_PROTOCOL_VERSION;
	return typeof v === "string" && v.length > 0;
}

export function readClientVersion(): string | undefined {
	const v = process.env.WARP_CLIENT_VERSION;
	return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ---------------------------------------------------------------------------
// Version parsing — pure, regex-driven
// ---------------------------------------------------------------------------

export function parseWarpVersion(raw: string | undefined): ParsedWarpVersion | null {
	if (!raw) return null;
	const m = VERSION_RE.exec(raw);
	if (!m) return null;
	const tuple: VersionTuple = [
		Number(m[1]),
		Number(m[2]),
		Number(m[3]),
		Number(m[4]),
		Number(m[5]),
		Number(m[7]),
		Number(m[7]),
	];
	return { tuple, channel: m[6] as Channel };
}

/** Element-wise `≤` over fixed-length tuples. Returns true on equal. */
export function tupleLeq(a: VersionTuple, b: VersionTuple): boolean {
	for (let i = 0; i < a.length; i++) {
		if (a[i] < b[i]) return true;
		if (a[i] > b[i]) return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// Broken-version gate
// ---------------------------------------------------------------------------

export function isBrokenVersion(parsed: ParsedWarpVersion | null): boolean {
	if (!parsed) return false;
	const threshold = BROKEN_VERSIONS[parsed.channel];
	if (threshold === null) return false;
	return tupleLeq(parsed.tuple, threshold);
}

// ---------------------------------------------------------------------------
// Composition — one assembly site for the structured-mode predicate
// ---------------------------------------------------------------------------

export function supportsStructured(): boolean {
	if (!hasStructuredProtocol()) return false;
	const parsed = parseWarpVersion(readClientVersion());
	return !isBrokenVersion(parsed);
}

export function detectWarpEnvironment(): WarpEnvironment {
	const isWarp = isWarpTerminal();
	if (!isWarp) return { isWarp: false, supportsStructured: false };
	return { isWarp: true, supportsStructured: supportsStructured() };
}
