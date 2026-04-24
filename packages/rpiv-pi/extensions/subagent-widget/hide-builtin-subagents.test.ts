import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import {
	filterDisabledFromListResult,
	LIST_FILTER_SNAPSHOT_FRAGMENT,
	PI_SUBAGENTS_BUILTINS,
	RPIV_SPECIALISTS,
	rewriteSubagentDescription,
	rewriteSubagentParameters,
} from "./hide-builtin-subagents.js";

// Mirrors pi-subagents@0.17.5/index.ts:311-336 verbatim. If upstream shifts the
// literals, the leak invariant below fails with a pointer to this fixture and
// the CHAIN_MODE_JSON_FRAGMENT / CHAIN_TEMPLATE_EXAMPLE_LINE constants in
// hide-builtin-subagents.ts.
const PI_SUBAGENTS_DESCRIPTION = `Delegate to subagents or manage agent definitions.

EXECUTION (use exactly ONE mode):
• SINGLE: { agent, task } - one task
• CHAIN: { chain: [{agent:"scout"}, {parallel:[{agent:"worker",count:3}]}] } - sequential pipeline with optional parallel fan-out
• PARALLEL: { tasks: [{agent,task,count?}, ...], concurrency?: number, worktree?: true } - concurrent execution (worktree: isolate each task in a git worktree)
• Optional context: { context: "fresh" | "fork" } (default: "fresh")

CHAIN TEMPLATE VARIABLES (use in task strings):
• {task} - The original task/request from the user
• {previous} - Text response from the previous step (empty for first step)
• {chain_dir} - Shared directory for chain files (e.g., <tmpdir>/pi-subagents-<scope>/chain-runs/abc123/)

Example: { chain: [{agent:"scout", task:"Analyze {task}"}, {agent:"planner", task:"Plan based on {previous}"}] }

MANAGEMENT (use action field, omit agent/task/chain/tasks):
• { action: "list" } - discover agents/chains
• { action: "get", agent: "name" } - full detail
• { action: "create", config: { name, systemPrompt, systemPromptMode, inheritProjectContext, inheritSkills, ... } }
• { action: "update", agent: "name", config: { ... } } - merge
• { action: "delete", agent: "name" }
• Use chainName for chain operations

CONTROL:
• { action: "status", id: "..." } - inspect an async/background run by id or prefix
• { action: "interrupt", id?: "..." } - soft-interrupt the current child turn and leave the run paused`;

describe("rewriteSubagentDescription — omit both builtin-name-bearing JSON examples", () => {
	const rewritten = rewriteSubagentDescription(PI_SUBAGENTS_DESCRIPTION) as string;

	it("every DESCRIPTION_REWRITES find-literal exists verbatim in the upstream snapshot (drift guard)", () => {
		// If upstream edits a literal (e.g. whitespace change), this test fails BEFORE the
		// leak invariant — it pinpoints WHICH literal went stale, not just "a builtin leaked".
		const fragments = [
			`{ chain: [{agent:"scout"}, {parallel:[{agent:"worker",count:3}]}] }`,
			`\n\nExample: { chain: [{agent:"scout", task:"Analyze {task}"}, {agent:"planner", task:"Plan based on {previous}"}] }`,
		];
		for (const fragment of fragments) {
			expect(PI_SUBAGENTS_DESCRIPTION).toContain(fragment);
		}
	});

	it("leaves no builtin agent name anywhere in the rewritten description", () => {
		for (const name of PI_SUBAGENTS_BUILTINS) {
			expect(rewritten).not.toContain(`"${name}"`);
		}
	});

	it("replaces the CHAIN mode concrete JSON with an abstract placeholder (line 315)", () => {
		expect(rewritten).toContain("• CHAIN: { chain: [...] } - sequential pipeline");
		expect(rewritten).not.toContain(`{agent:"scout"}`);
		expect(rewritten).not.toContain(`{agent:"worker",count:3}`);
	});

	it("removes the standalone Example: line (line 324) entirely including its blank-line prefix", () => {
		expect(rewritten).not.toContain("Example:");
		expect(rewritten).not.toContain(`task:"Analyze {task}"`);
		expect(rewritten).not.toContain(`task:"Plan based on {previous}"`);
	});

	it("preserves surrounding prose: mode bullets, template variables, management + control sections", () => {
		expect(rewritten).toContain("• SINGLE: { agent, task }");
		expect(rewritten).toContain("• PARALLEL:");
		expect(rewritten).toContain("CHAIN TEMPLATE VARIABLES");
		expect(rewritten).toContain("{task} - The original task/request from the user");
		expect(rewritten).toContain(`{ action: "list" }`);
		expect(rewritten).toContain(`{ action: "status", id: "..." }`);
	});

	it("is a no-op on inputs that don't contain either literal (upstream drift)", () => {
		const unrelated = "Tool description without any known fragments.";
		expect(rewriteSubagentDescription(unrelated)).toBe(unrelated);
	});

	it("passes undefined through unchanged", () => {
		expect(rewriteSubagentDescription(undefined)).toBe(undefined);
	});
});

describe("rewriteSubagentParameters — pin top-level agent to RPIV_SPECIALISTS enum", () => {
	const original = Type.Object({
		agent: Type.Optional(Type.String({ description: "orig agent description" })),
		task: Type.Optional(Type.String({ description: "task" })),
		tasks: Type.Optional(Type.Array(Type.Object({ agent: Type.String(), task: Type.String() }))),
	});

	it("re-types the agent field to an optional string enum of RPIV_SPECIALISTS", () => {
		const rewritten = rewriteSubagentParameters(original) as unknown as {
			properties: { agent: { type: string; enum: string[] } };
		};
		const agent = rewritten.properties.agent;
		expect(agent.type).toBe("string");
		expect(agent.enum).toEqual([...RPIV_SPECIALISTS]);
	});

	it("preserves all other top-level properties unchanged by reference", () => {
		const rewritten = rewriteSubagentParameters(original) as unknown as {
			properties: { task: unknown; tasks: unknown };
		};
		expect(rewritten.properties.task).toBe(original.properties.task);
		expect(rewritten.properties.tasks).toBe(original.properties.tasks);
	});

	it("preserves Type.Optional modifier on sibling fields (TypeBox symbol carried via reference spread)", () => {
		const schema = Type.Object({
			agent: Type.Optional(Type.String()),
			task: Type.Optional(Type.String()),
		});
		const rewritten = rewriteSubagentParameters(schema);
		const optionalKey = Object.getOwnPropertySymbols(schema.properties.task).find(
			(s) => s.description === "TypeBox.Optional",
		);
		expect(optionalKey).toBeDefined();
		const preservedFlag = (rewritten as typeof schema).properties.task[
			optionalKey as keyof typeof schema.properties.task
		];
		expect(preservedFlag).toBe("Optional");
	});

	it("does not mutate the input schema", () => {
		const snapshot = JSON.stringify(original);
		rewriteSubagentParameters(original);
		expect(JSON.stringify(original)).toBe(snapshot);
	});

	it("returns input unchanged when it is not a TypeBox object schema (defensive fallback)", () => {
		const notASchema = { foo: "bar" } as unknown;
		expect(rewriteSubagentParameters(notASchema)).toBe(notASchema);
		expect(rewriteSubagentParameters(undefined)).toBe(undefined);
	});
});

// Mirrors the `- <name> (<source>, disabled): <desc>` row format emitted by
// pi-subagents@0.17.5/agent-management.ts:375 (`handleList`). If upstream
// shifts the literal, the drift guard below fails first — pointing at
// LIST_FILTER_SNAPSHOT_FRAGMENT in hide-builtin-subagents.ts.
const PI_SUBAGENTS_LIST_OUTPUT = `Agents:
- claim-verifier (project): Adversarial finding verifier. …
- codebase-analyzer (project): Analyzes codebase implementation details. …
- context-builder (builtin, disabled): Analyzes requirements and codebase, generates context and meta-prompt
- delegate (builtin, disabled): Lightweight subagent that inherits the parent model with no default reads
- general-purpose (project): General-purpose agent for researching complex questions …
- oracle (builtin, disabled): High-context decision-consistency oracle that protects inherited state and prevents drift
- oracle-executor (builtin, disabled): High-context implementation agent that executes only after main-agent approval
- planner (builtin, disabled): Creates implementation plans from context and requirements
- researcher (builtin, disabled): Autonomous web researcher …
- reviewer (builtin, disabled): Code review specialist that validates implementation and fixes issues
- scout (builtin, disabled): Fast codebase recon that returns compressed context for handoff
- thoughts-locator (project): Discovers relevant documents in thoughts/ directory …
- worker (builtin, disabled): General-purpose subagent with full capabilities

Chains:
- (none)`;

describe("filterDisabledFromListResult — strip disabled builtin rows from handleList output", () => {
	it("drift guard: handleList still emits the '(builtin, disabled)' suffix somewhere in the snapshot", () => {
		expect(PI_SUBAGENTS_LIST_OUTPUT).toContain(LIST_FILTER_SNAPSHOT_FRAGMENT);
	});

	it("removes every row tagged '(builtin, disabled)' — leak invariant over all 9 builtins", () => {
		const filtered = filterDisabledFromListResult(PI_SUBAGENTS_LIST_OUTPUT) as string;
		for (const name of PI_SUBAGENTS_BUILTINS) {
			expect(filtered).not.toContain(`- ${name} (builtin, disabled)`);
		}
		expect(filtered).not.toMatch(/, disabled\)/);
	});

	it("preserves non-disabled project rows and the Chains section verbatim", () => {
		const filtered = filterDisabledFromListResult(PI_SUBAGENTS_LIST_OUTPUT) as string;
		expect(filtered).toContain("- claim-verifier (project):");
		expect(filtered).toContain("- codebase-analyzer (project):");
		expect(filtered).toContain("- general-purpose (project):");
		expect(filtered).toContain("- thoughts-locator (project):");
		expect(filtered).toContain("Chains:");
		expect(filtered).toContain("- (none)");
	});

	it("keeps the Agents: header and blank-line-before-Chains even when every builtin is removed", () => {
		const filtered = filterDisabledFromListResult(PI_SUBAGENTS_LIST_OUTPUT) as string;
		expect(filtered.startsWith("Agents:\n")).toBe(true);
		expect(filtered).toMatch(/\n\nChains:/);
	});

	it("consumes trailing newline on each removed row (no accumulated blank lines)", () => {
		const minimal = "Agents:\n- scout (builtin, disabled): a\n- foo (project): b\n\nChains:\n- (none)";
		const filtered = filterDisabledFromListResult(minimal) as string;
		expect(filtered).toBe("Agents:\n- foo (project): b\n\nChains:\n- (none)");
	});

	it("handles a disabled row at EOF (no trailing newline) without leaving it behind", () => {
		const endEdge = "Agents:\n- foo (project): b\n- scout (builtin, disabled): a";
		const filtered = filterDisabledFromListResult(endEdge) as string;
		expect(filtered).toBe("Agents:\n- foo (project): b\n");
	});

	it("is a no-op on inputs that contain no disabled-tagged rows", () => {
		const userOnly = "Agents:\n- claim-verifier (project): x\n\nChains:\n- (none)";
		expect(filterDisabledFromListResult(userOnly)).toBe(userOnly);
	});

	it("passes undefined through unchanged", () => {
		expect(filterDisabledFromListResult(undefined)).toBe(undefined);
	});
});
