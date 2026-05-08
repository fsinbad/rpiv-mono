export const TARGET_SAMPLE_RATE = 16000;
export const FRAMES_PER_BUFFER = 1600;

const VAD_THRESHOLD = 0.5;
const VAD_HOLDOFF_MS = 300;

export interface DecibriLike {
	on(event: "data", listener: (chunk: Buffer) => void): unknown;
	on(event: "speech" | "silence", listener: () => void): unknown;
	once(event: "end" | "error" | "close", listener: (err?: Error) => void): unknown;
	stop(): void;
}

interface DecibriCtor {
	new (opts: Record<string, unknown>): DecibriLike;
}

export async function createMic(): Promise<DecibriLike> {
	// decibri ships as CJS (`module.exports = Decibri`); under ESM the ctor lands on `.default`.
	const mod = (await import("decibri")) as { default: DecibriCtor };
	const Decibri = mod.default;
	return new Decibri({
		sampleRate: TARGET_SAMPLE_RATE,
		channels: 1,
		framesPerBuffer: FRAMES_PER_BUFFER,
		format: "int16",
		vad: true,
		vadMode: "silero",
		vadThreshold: VAD_THRESHOLD,
		vadHoldoff: VAD_HOLDOFF_MS,
	});
}
