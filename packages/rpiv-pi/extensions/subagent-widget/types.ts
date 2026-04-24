/**
 * Shared types for the subagent-tree widget.
 *
 * SingleResult / SubagentDetails mirror the shape emitted by pi-subagents
 * (nicobailon fork) and the pi-coding-agent bundled subagent example. Both
 * upstream sources expose this shape through examples, not stable public
 * type exports, so we duplicate locally to insulate from drift.
 */

import type { Message } from "@mariozechner/pi-ai";

export type RunMode = "single" | "chain" | "parallel";

export type RunStatus = "running" | "completed" | "error" | "aborted" | "steered" | "stopped";

export type ErrorStatus = Extract<RunStatus, "error" | "aborted" | "steered" | "stopped">;

export interface UsageStats {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
}

export interface SingleResult {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
}

/**
 * Per-agent live progress snapshot. Nicobailon emits this in
 * partialResult.details.progress during streaming — fields update on
 * every tool start and every message_end, well before the terminal
 * usage fields on SingleResult settle. Mirrors the shape at
 * /usr/local/lib/node_modules/pi-subagents/types.ts:76-94 (only the
 * fields we render are declared here).
 */
export interface AgentProgress {
	status?: "pending" | "running" | "completed" | "failed" | "detached";
	toolCount?: number;
	tokens?: number;
	durationMs?: number;
	currentTool?: string;
	activityState?: "starting" | "active" | "quiet" | "stalled" | "paused";
}

export interface SubagentDetails {
	mode: RunMode;
	agentScope: string;
	projectAgentsDir: string | null;
	results: SingleResult[];
	progress?: AgentProgress[];
}

/**
 * Per-toolCallId state snapshot. Mutated in place on update — preserves
 * reference identity so tui.requestRender() sees fresh data without
 * re-invoking the setWidget factory.
 */
export interface TrackedRun {
	toolCallId: string;
	mode: RunMode;
	status: RunStatus;
	startedAt: number;
	completedAt?: number;
	displayName: string;
	description: string;
	results: SingleResult[];
	progress?: AgentProgress[];
	errorMessage?: string;
}
