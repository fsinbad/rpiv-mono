import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getErrorLogPath } from "../audio/error-log.js";
import type { DecibriLike } from "../audio/mic-source.js";
import type { SttEngine } from "../audio/stt-engine.js";
import type { VoiceAction } from "../state/key-router.js";
import type { VoiceSession } from "../state/voice-session.js";
import { startDictationPipeline } from "./pipeline-runner.js";

class FakeMic extends EventEmitter implements DecibriLike {
	on(event: string, listener: (...args: never[]) => void): this {
		return super.on(event, listener as (...args: unknown[]) => void);
	}
	once(event: string, listener: (...args: never[]) => void): this {
		return super.once(event, listener as (...args: unknown[]) => void);
	}
	stop(): void {
		this.emit("end");
	}
}

// 1600 int16 samples × 100 ms of audio with non-trivial RMS so it survives
// the MIN_SEGMENT_RMS gate inside flushBuffer.
function loudChunk(): Buffer {
	const samples = 1600;
	const buf = Buffer.alloc(samples * 2);
	for (let i = 0; i < samples; i++) {
		// Alternating ~+/- 8000 amplitude (well above the -46 dBFS noise floor).
		buf.writeInt16LE(i % 2 === 0 ? 8000 : -8000, i * 2);
	}
	return buf;
}

interface CapturedSession {
	session: VoiceSession;
	dispatched: VoiceAction[];
}

function makeSession(): CapturedSession {
	const dispatched: VoiceAction[] = [];
	const session = {
		dispatchAction: (action: VoiceAction) => {
			dispatched.push(action);
		},
	} as unknown as VoiceSession;
	return { session, dispatched };
}

describe("startDictationPipeline — STT recognize failure", () => {
	let abort: AbortController;

	beforeEach(() => {
		abort = new AbortController();
	});

	afterEach(() => {
		if (!abort.signal.aborted) abort.abort();
	});

	it("logs the error to errors.log and keeps the pipeline running for the next segment", async () => {
		const mic = new FakeMic();
		const { session, dispatched } = makeSession();

		// First recognize() throws; second succeeds. We expect: log line written,
		// no transcript dispatched for the failed segment, transcript dispatched
		// for the successful follow-up segment, pipeline never crashed.
		const recognize = vi
			.fn<SttEngine["recognize"]>()
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValueOnce("hello world");
		const sttEngine: SttEngine = {
			recognize,
			release: () => {},
		};

		const handle = startDictationPipeline(mic, sttEngine, session, abort.signal);

		// flushBuffer chains as a microtask via `recognizing.then(...)`. If we
		// emit the next segment synchronously before yielding, the second chunk
		// gets concatenated into the still-pending first segment and only one
		// recognize() call ever happens. Yield via setImmediate so each segment
		// is processed independently.
		const yieldToFlush = () => new Promise<void>((r) => setImmediate(r));

		// Segment 1 → fails
		mic.emit("data", loudChunk());
		mic.emit("silence");
		await yieldToFlush();
		await yieldToFlush();

		// Segment 2 → succeeds
		mic.emit("data", loudChunk());
		mic.emit("silence");
		await yieldToFlush();
		await yieldToFlush();

		// End the mic so finalTranscriptPromise resolves.
		mic.emit("end");
		const finalTranscript = await handle.finalTranscriptPromise;

		expect(recognize).toHaveBeenCalledTimes(2);
		expect(finalTranscript).toBe("hello world");

		// Only one transcript dispatch (the successful one).
		const transcripts = dispatched.filter((a) => a.kind === "audio_transcript_appended");
		expect(transcripts).toHaveLength(1);
		expect(transcripts[0]).toMatchObject({ kind: "audio_transcript_appended", text: "hello world" });

		// Error log was written exactly once with the failed scope.
		const path = getErrorLogPath();
		expect(existsSync(path)).toBe(true);
		const content = readFileSync(path, "utf-8");
		expect(content).toMatch(/\[stt\.recognize\] Error: boom/);
		expect(content.trimEnd().split("\n")).toHaveLength(1);
	});
});
