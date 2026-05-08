import { appendErrorLog } from "../audio/error-log.js";
import { isHallucination } from "../audio/hallucination-filter.js";
import type { DecibriLike } from "../audio/mic-source.js";
import { TARGET_SAMPLE_RATE } from "../audio/mic-source.js";
import { bufferToFloat32, computeRmsFloat32, computeRmsInt16, samplesInInt16Chunk } from "../audio/pcm.js";
import type { SttEngine } from "../audio/stt-engine.js";
import { isHallucinationFilterEnabled } from "../config/voice-config.js";
import type { VoiceSession } from "../state/voice-session.js";

// 12 s soft cap: Whisper trains on 30 s windows and degrades on very short
// inputs; 5 s force-flushes routinely bisect a clause mid-word. 12 s is the
// dictation-tool consensus (LiveKit, whisper_streaming) — long enough to fit
// most sentences, short enough to bound first-token latency.
const MAX_SEGMENT_MS = 12000;
const MAX_SEGMENT_SAMPLES = (TARGET_SAMPLE_RATE * MAX_SEGMENT_MS) / 1000;

// When the cap fires, scan the trailing 800 ms for the chunk with the lowest
// RMS and split there instead of at the wall-clock boundary. The "head" half
// goes to Whisper, the "tail" carries forward as the start of the next
// segment. Cuts mid-breath instead of mid-syllable.
const CAP_CUT_SCAN_MS = 800;
const CAP_CUT_SCAN_SAMPLES = (TARGET_SAMPLE_RATE * CAP_CUT_SCAN_MS) / 1000;

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
	let hallucinationFilterEnabled = isHallucinationFilterEnabled(options);

	const recognizeChunks = async (chunks: Buffer[]): Promise<void> => {
		if (chunks.length === 0) return;
		const samples = bufferToFloat32(Buffer.concat(chunks));
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

	const flushBuffer = async (): Promise<void> => {
		if (speechBuffer.length === 0) return;
		const chunks = speechBuffer;
		speechBuffer = [];
		speechBufferSamples = 0;
		await recognizeChunks(chunks);
	};

	const queueFlush = () => {
		recognizing = recognizing.then(flushBuffer);
	};

	const queueCapFlush = () => {
		const cutIdx = findLowestEnergyCutIndex(speechBuffer);
		if (cutIdx <= 0 || cutIdx >= speechBuffer.length) {
			queueFlush();
			return;
		}
		const head = speechBuffer.slice(0, cutIdx);
		const tail = speechBuffer.slice(cutIdx);
		speechBuffer = tail;
		speechBufferSamples = countSamples(tail);
		recognizing = recognizing.then(() => recognizeChunks(head));
	};

	mic.on("data", (chunk: Buffer) => {
		const level = computeRmsInt16(chunk);
		session.dispatchAction({ kind: "audio_chunk", level });
		if (paused) return;
		speechBuffer.push(chunk);
		speechBufferSamples += samplesInInt16Chunk(chunk);
		if (speechBufferSamples >= MAX_SEGMENT_SAMPLES) queueCapFlush();
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

function countSamples(chunks: Buffer[]): number {
	let total = 0;
	for (const chunk of chunks) total += samplesInInt16Chunk(chunk);
	return total;
}

// Walk chunks newest-first up to CAP_CUT_SCAN_SAMPLES of audio; return the
// index of the lowest-RMS chunk in that window. Returns chunks.length when
// the buffer is too short to scan, telling the caller to fall back to a full
// flush.
function findLowestEnergyCutIndex(chunks: Buffer[]): number {
	if (chunks.length < 2) return chunks.length;
	let scanned = 0;
	let lowestRms = Number.POSITIVE_INFINITY;
	let lowestIdx = chunks.length;
	for (let i = chunks.length - 1; i >= 1; i--) {
		const chunk = chunks[i];
		if (!chunk) continue;
		const rms = computeRmsInt16(chunk);
		if (rms < lowestRms) {
			lowestRms = rms;
			lowestIdx = i;
		}
		scanned += samplesInInt16Chunk(chunk);
		if (scanned >= CAP_CUT_SCAN_SAMPLES) break;
	}
	return lowestIdx;
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
