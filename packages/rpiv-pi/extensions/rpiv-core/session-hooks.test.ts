import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockCtx, createMockPi, stubGitExec } from "@juicesharp/rpiv-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./package-checks.js", () => ({ findMissingSiblings: vi.fn(() => []) }));
vi.mock("./agents.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./agents.js")>();
	return {
		...actual,
		syncBundledAgents: vi.fn(() => ({
			added: [],
			updated: [],
			unchanged: [],
			removed: [],
			pendingUpdate: [],
			pendingRemove: [],
			errors: [],
		})),
	};
});

import { clearGitContextCache, getGitContext, resetInjectedMarker } from "./git-context.js";
import { clearInjectionState } from "./guidance.js";
import { registerSessionHooks } from "./session-hooks.js";

let projectDir: string;

beforeEach(() => {
	projectDir = mkdtempSync(join(tmpdir(), "rpiv-session-"));
	clearInjectionState();
	clearGitContextCache();
	resetInjectedMarker();
});
afterEach(() => {
	rmSync(projectDir, { recursive: true, force: true });
});

describe("registerSessionHooks — event wiring", () => {
	it("registers 5 events", () => {
		const { pi, captured } = createMockPi();
		registerSessionHooks(pi);
		for (const ev of ["session_start", "session_compact", "session_shutdown", "tool_call", "before_agent_start"]) {
			expect(captured.events.has(ev)).toBe(true);
		}
	});
});

describe("session_start hook", () => {
	it("scaffolds thoughts dirs under ctx.cwd", async () => {
		const { pi, captured } = createMockPi({ exec: stubGitExec({}) as never });
		registerSessionHooks(pi);
		const handler = captured.events.get("session_start")?.[0];
		const ctx = createMockCtx({ cwd: projectDir, hasUI: true });
		await handler?.({ reason: "startup" } as never, ctx as never);
		for (const d of [
			"thoughts/shared/research",
			"thoughts/shared/questions",
			"thoughts/shared/designs",
			"thoughts/shared/plans",
			"thoughts/shared/handoffs",
			"thoughts/shared/reviews",
		]) {
			expect(existsSync(join(projectDir, d))).toBe(true);
		}
	});
});

describe("tool_call hook", () => {
	it("clears git-context cache on mutating bash command", async () => {
		const exec = stubGitExec({ branch: "main", commit: "a", user: "u" });
		const { pi, captured } = createMockPi({ exec: exec as never });
		registerSessionHooks(pi);
		const handler = captured.events.get("tool_call")?.[0];
		const ctx = createMockCtx({ cwd: projectDir });
		await getGitContext(pi);
		const before = exec.mock.calls.length;
		await handler?.({ toolName: "bash", input: { command: "git commit -m x" } } as never, ctx as never);
		await getGitContext(pi);
		expect(exec.mock.calls.length).toBeGreaterThan(before);
	});
});

describe("before_agent_start hook", () => {
	it("returns {message} on changed git sig", async () => {
		const { pi, captured } = createMockPi({
			exec: stubGitExec({ branch: "main", commit: "abc", user: "alice" }) as never,
		});
		registerSessionHooks(pi);
		const handler = captured.events.get("before_agent_start")?.[0];
		const ctx = createMockCtx({ cwd: projectDir });
		const r = await handler?.({} as never, ctx as never);
		expect(r).toHaveProperty("message");
	});

	it("returns undefined on dedup (signature unchanged)", async () => {
		const { pi, captured } = createMockPi({
			exec: stubGitExec({ branch: "main", commit: "abc", user: "alice" }) as never,
		});
		registerSessionHooks(pi);
		const handler = captured.events.get("before_agent_start")?.[0];
		const ctx = createMockCtx({ cwd: projectDir });
		await handler?.({} as never, ctx as never);
		const second = await handler?.({} as never, ctx as never);
		expect(second).toBeUndefined();
	});
});
