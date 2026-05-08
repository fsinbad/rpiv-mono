import { describe, expect, it } from "vitest";
import type { RecordingStatus } from "./state.js";
import { STATUS_META } from "./status-intent.js";

describe("STATUS_META", () => {
	it("has an entry for every RecordingStatus", () => {
		const kinds: RecordingStatus[] = ["recording", "paused"];
		for (const k of kinds) expect(STATUS_META[k]).toBeDefined();
	});

	it("only 'paused' gates the STT pipeline", () => {
		expect(STATUS_META.recording.gatesSttPipeline).toBe(false);
		expect(STATUS_META.paused.gatesSttPipeline).toBe(true);
	});

	it("levelFactor is 1 when recording and < 1 when paused", () => {
		expect(STATUS_META.recording.levelFactor).toBe(1);
		expect(STATUS_META.paused.levelFactor).toBeLessThan(1);
	});
});
