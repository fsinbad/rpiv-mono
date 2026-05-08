import type { RecordingStatus } from "./state.js";

export interface StatusIntentMeta {
	glyph: string;
	glyphColorKey: "error" | "warning";
	label: string;
	equalizerColorKey: "accent" | "dim";
	levelFactor: number;
	pauseHint: string;
	gatesSttPipeline: boolean;
}

export const STATUS_META: Record<RecordingStatus, StatusIntentMeta> = {
	recording: {
		glyph: "●",
		glyphColorKey: "error",
		label: "Recording",
		equalizerColorKey: "accent",
		levelFactor: 1,
		pauseHint: "Space to pause",
		gatesSttPipeline: false,
	},
	paused: {
		glyph: "⏸",
		glyphColorKey: "warning",
		label: "Paused",
		equalizerColorKey: "dim",
		levelFactor: 0.25,
		pauseHint: "Space to resume",
		gatesSttPipeline: true,
	},
};
