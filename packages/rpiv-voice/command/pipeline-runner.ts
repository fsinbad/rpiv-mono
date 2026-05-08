import { appendErrorLog } from "../audio/error-log.js";
import { isHallucination } from "../audio/hallucination-filter.js";
import type { DecibriLike } from "../audio/mic-source.js";
import { TARGET_SAMPLE_RATE } from "../audio/mic-source.js";
import { BYTES_PER_INT16, bufferToFloat32, computeRmsFloat32, computeRmsInt16 } from "../audio/pcm.js";
import type { SttEngine } from "../audio/stt-engine.js";
import type { VoiceSession } from "../state/voice-session.js";

const MAX_SEGMENT_MS = 5000;
const MAX_SEGMENT_SAMPLES = (TARGET_SAMPLE_RATE * MAX_SEGMENT_MS) / 1000;

// Whisper hallucinates filler ("Thanks for watching", "♪", "1/2 1/2…") on
// near-silent input. sherpa-onnx-node doesn't expose the decoder thresholds
// that would suppress this, so we gate at the input: skip segments whose mean
// RMS is below a floor. ~-46 dBFS sits between room noise and quiet speech.
const MIN_SEGMENT_RMS = 0.005;

export interface PipelineHandle {
	finalTranscriptPromise: Promise<string>;
	isPaused(): boolean;
	setPaused(paused: boolean): void;
	setHallucinationFilterEnabled(enabled: boolean): void;
	stop(): void;
}

export interface PipelineOptions {
	hallucinationFilterEnabled?: boolean;
}

export function startDictationPipeline(
	mic: DecibriLike,
	sttEngine: SttEngine,
	session: VoiceSession,
	signal: AbortSignal,
	options: PipelineOptions = {},
): PipelineHandle {
	let speechBuffer: Buffer[] = [];
	let speechBufferSamples = 0;
	let transcript = "";
	let recognizing: Promise<void> = Promise.resolve();
	let paused = false;
	let hallucinationFilterEnabled = options.hallucinationFilterEnabled !== false;

	const flushBuffer = async (): Promise<void> => {
		if (speechBuffer.length === 0) return;
		const samples = bufferToFloat32(Buffer.concat(speechBuffer));
		speechBuffer = [];
		speechBufferSamples = 0;
		if (computeRmsFloat32(samples) < MIN_SEGMENT_RMS) return;
		try {
			const text = await sttEngine.recognize(samples, TARGET_SAMPLE_RATE);
			if (!text) return;
			if (hallucinationFilterEnabled && isHallucination(text)) return;
			transcript = transcript ? `${transcript} ${text}` : text;
			session.dispatchAction({ kind: "audio_transcript_appended", text });
		} catch (err) {
			// We deliberately do not surface this to the TUI: writing to stderr
			// corrupts the active render, and `notify` would churn the chat for
			// every dropped segment. Instead, append a breadcrumb to a file the
			// user can `cat` later when investigating transcript gaps.
			appendErrorLog("stt.recognize", err);
		}
	};

	const queueFlush = () => {
		recognizing = recognizing.then(flushBuffer);
	};

	mic.on("data", (chunk: Buffer) => {
		const level = computeRmsInt16(chunk);
		session.dispatchAction({ kind: "audio_chunk", level });
		if (paused) return;
		speechBuffer.push(chunk);
		speechBufferSamples += chunk.length / BYTES_PER_INT16;
		if (speechBufferSamples >= MAX_SEGMENT_SAMPLES) queueFlush();
	});
	mic.on("silence", () => {
		if (paused) return;
		queueFlush();
	});

	const finalTranscriptPromise = waitForMicShutdown(mic, signal, async () => {
		await recognizing;
		await flushBuffer();
	}).then(() => transcript);

	return {
		finalTranscriptPromise,
		isPaused: () => paused,
		setPaused: (v) => {
			paused = v;
		},
		setHallucinationFilterEnabled: (v) => {
			hallucinationFilterEnabled = v;
		},
		stop: () => {
			mic.stop();
		},
	};
}

function waitForMicShutdown(mic: DecibriLike, signal: AbortSignal, onFinish: () => Promise<void>): Promise<void> {
	return new Promise<void>((resolve) => {
		const onAbort = () => {
			mic.stop();
		};
		const finish = async () => {
			signal.removeEventListener("abort", onAbort);
			await onFinish();
			resolve();
		};
		mic.once("end", finish);
		mic.once("error", finish);
		if (signal.aborted) {
			mic.stop();
		} else {
			signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}
