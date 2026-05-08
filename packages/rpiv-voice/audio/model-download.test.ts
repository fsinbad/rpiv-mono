import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: vi.fn(actual.existsSync),
		mkdirSync: vi.fn(actual.mkdirSync),
		rmSync: vi.fn(actual.rmSync),
		writeFileSync: vi.fn(actual.writeFileSync),
		createWriteStream: vi.fn(actual.createWriteStream),
	};
});

import { existsSync, rmSync } from "node:fs";
import {
	assertModelIntact,
	ensureModelDownloaded,
	getModelPaths,
	isModelDownloaded,
	ModelInstallError,
	removeModelInstall,
	WHISPER_BASE_DIR,
} from "./model-download.js";

describe("isModelDownloaded", () => {
	it("returns true when sentinel file exists", () => {
		vi.mocked(existsSync).mockReturnValueOnce(true);
		expect(isModelDownloaded()).toBe(true);
	});
	it("returns false when sentinel file is missing", () => {
		vi.mocked(existsSync).mockReturnValueOnce(false);
		expect(isModelDownloaded()).toBe(false);
	});
});

describe("getModelPaths", () => {
	it("returns paths under whisper-base/", () => {
		const paths = getModelPaths();
		expect(paths.encoderPath).toContain("whisper-base");
		expect(paths.decoderPath).toContain("whisper-base");
		expect(paths.tokensPath).toContain("whisper-base");
	});
});

describe("ensureModelDownloaded", () => {
	it("skips download when model already exists", async () => {
		vi.mocked(existsSync).mockReturnValue(true);
		const onProgress = vi.fn();
		const paths = await ensureModelDownloaded(onProgress);
		expect(paths.encoderPath).toContain("base-encoder.int8.onnx");
		expect(onProgress).not.toHaveBeenCalled();
	});
});

describe("ensureModelDownloaded — failure rollback", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.mocked(existsSync).mockReturnValue(false); // sentinel never exists during these runs
		vi.mocked(rmSync).mockClear();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("wipes the model dir when fetch fails (network down)", async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error("ENOTFOUND")) as unknown as typeof fetch;

		await expect(ensureModelDownloaded(() => {})).rejects.toMatchObject({
			name: "ModelInstallError",
			stage: "download",
		});

		const wiped = vi
			.mocked(rmSync)
			.mock.calls.some((args) => args[0] === WHISPER_BASE_DIR && args[1]?.recursive === true);
		expect(wiped).toBe(true);
	});

	it("wipes the model dir when HTTP returns non-200", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 503,
			body: null,
		} as unknown as Response) as unknown as typeof fetch;

		const err = await ensureModelDownloaded(() => {}).catch((e) => e);
		expect(err).toBeInstanceOf(ModelInstallError);
		expect((err as ModelInstallError).stage).toBe("download");

		const wiped = vi
			.mocked(rmSync)
			.mock.calls.some((args) => args[0] === WHISPER_BASE_DIR && args[1]?.recursive === true);
		expect(wiped).toBe(true);
	});
});

describe("removeModelInstall", () => {
	it("rmSyncs the whisper-base dir recursively + force", () => {
		vi.mocked(rmSync).mockClear();
		removeModelInstall();
		expect(vi.mocked(rmSync)).toHaveBeenCalledWith(WHISPER_BASE_DIR, { recursive: true, force: true });
	});
});

describe("assertModelIntact", () => {
	it("throws when a required model file is missing", () => {
		// Override existsSync per call: first two true (encoder, decoder) then false (tokens)
		const seq = [true, false];
		vi.mocked(existsSync).mockImplementation(() => seq.shift() ?? false);
		expect(() => assertModelIntact()).toThrow(/Model verification failed/);
	});

	it("does not throw when all required files exist", () => {
		vi.mocked(existsSync).mockReturnValue(true);
		expect(() => assertModelIntact()).not.toThrow();
	});
});
