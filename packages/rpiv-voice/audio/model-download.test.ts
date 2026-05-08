import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return { ...actual, existsSync: vi.fn(actual.existsSync) };
});

import { existsSync } from "node:fs";
import { ensureModelDownloaded, getModelPaths, isModelDownloaded } from "./model-download.js";

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
