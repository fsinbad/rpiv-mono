import { createMockCtx, createMockPi } from "@juicesharp/rpiv-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pi-installer.js", () => ({ spawnPiInstall: vi.fn() }));
vi.mock("./package-checks.js", () => ({ findMissingSiblings: vi.fn() }));

import { findMissingSiblings } from "./package-checks.js";
import { spawnPiInstall } from "./pi-installer.js";
import { registerSetupCommand } from "./setup-command.js";

beforeEach(() => {
	vi.mocked(spawnPiInstall).mockReset();
	vi.mocked(findMissingSiblings).mockReset();
});

describe("/rpiv-setup — command shape", () => {
	it("registers under 'rpiv-setup'", () => {
		const { pi, captured } = createMockPi();
		registerSetupCommand(pi);
		expect(captured.commands.has("rpiv-setup")).toBe(true);
	});
});

describe("/rpiv-setup — !hasUI", () => {
	it("notifies error and exits", async () => {
		const { pi, captured } = createMockPi();
		registerSetupCommand(pi);
		const ctx = createMockCtx({ hasUI: false });
		await captured.commands.get("rpiv-setup")?.handler("", ctx as never);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("interactive"), "error");
		expect(spawnPiInstall).not.toHaveBeenCalled();
	});
});

describe("/rpiv-setup — all installed", () => {
	it("notifies all-installed info and exits", async () => {
		vi.mocked(findMissingSiblings).mockReturnValue([]);
		const { pi, captured } = createMockPi();
		registerSetupCommand(pi);
		const ctx = createMockCtx({ hasUI: true });
		await captured.commands.get("rpiv-setup")?.handler("", ctx as never);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("already installed"), "info");
	});
});

describe("/rpiv-setup — user cancels", () => {
	it("notifies cancelled info and skips installs", async () => {
		vi.mocked(findMissingSiblings).mockReturnValue([{ pkg: "npm:@x/y", matches: /./, provides: "p" }]);
		const { pi, captured } = createMockPi();
		registerSetupCommand(pi);
		const ctx = createMockCtx({ hasUI: true });
		(ctx.ui.confirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
		await captured.commands.get("rpiv-setup")?.handler("", ctx as never);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("cancelled"), "info");
		expect(spawnPiInstall).not.toHaveBeenCalled();
	});
});

describe("/rpiv-setup — mixed success/failure report", () => {
	it("reports succeeded + failed with 300-char stderr snippets", async () => {
		vi.mocked(findMissingSiblings).mockReturnValue([
			{ pkg: "npm:@x/a", matches: /./, provides: "A" },
			{ pkg: "npm:@x/b", matches: /./, provides: "B" },
		]);
		vi.mocked(spawnPiInstall)
			.mockResolvedValueOnce({ code: 0, stdout: "ok", stderr: "" })
			.mockResolvedValueOnce({ code: 1, stdout: "", stderr: "x".repeat(500) });
		const { pi, captured } = createMockPi();
		registerSetupCommand(pi);
		const ctx = createMockCtx({ hasUI: true });
		await captured.commands.get("rpiv-setup")?.handler("", ctx as never);
		const reportCall = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1);
		const report: string = reportCall![0];
		expect(report).toContain("npm:@x/a");
		expect(report).toContain("npm:@x/b");
		// stderr snippet capped at 300 chars
		expect((report.match(/x+/g) ?? []).every((m) => m.length <= 300)).toBe(true);
		expect(reportCall![1]).toBe("warning");
	});

	it("uses stdout fallback when stderr empty", async () => {
		vi.mocked(findMissingSiblings).mockReturnValue([{ pkg: "npm:@x/a", matches: /./, provides: "A" }]);
		vi.mocked(spawnPiInstall).mockResolvedValueOnce({ code: 1, stdout: "stdout-error", stderr: "" });
		const { pi, captured } = createMockPi();
		registerSetupCommand(pi);
		const ctx = createMockCtx({ hasUI: true });
		await captured.commands.get("rpiv-setup")?.handler("", ctx as never);
		const report = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
		expect(report).toContain("stdout-error");
	});

	it("all-failed report omits Restart line", async () => {
		vi.mocked(findMissingSiblings).mockReturnValue([{ pkg: "npm:@x/a", matches: /./, provides: "A" }]);
		vi.mocked(spawnPiInstall).mockResolvedValueOnce({ code: 1, stdout: "", stderr: "err" });
		const { pi, captured } = createMockPi();
		registerSetupCommand(pi);
		const ctx = createMockCtx({ hasUI: true });
		await captured.commands.get("rpiv-setup")?.handler("", ctx as never);
		const report = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
		expect(report).not.toContain("Restart");
	});
});
