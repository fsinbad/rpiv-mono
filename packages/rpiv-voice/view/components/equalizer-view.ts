import type { Theme } from "@earendil-works/pi-coding-agent";
import type { RecordingStatus } from "../../state/state.js";
import type { StatefulView } from "../stateful-view.js";

const COLOR_ACCENT = "accent";
const COLOR_DIM = "dim";

// Lower-block glyphs from 0/8 to 8/8. Index 0 (space) renders as silence and
// keeps the row height stable when the buffer is empty or below the perceptual
// floor.
const BAR_GLYPHS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

// Caps the rolling history so the buffer survives a wider terminal without
// reallocating. 256 columns covers any realistic terminal width.
const HISTORY_CAP = 256;

// RMS values for normal speech sit around 0.02–0.15 — mapping `level` linearly
// to a 0–8 bar would leave most speech invisible. `sqrt(level * 4)` is the same
// shape used by classic VU meters: quiet talking lights up the lower 3–4 bars,
// loud peaks fill the column without clipping the floor.
const PERCEPTUAL_GAIN = 4;

export interface EqualizerViewProps {
	level: number;
	status: RecordingStatus;
}

export class EqualizerView implements StatefulView<EqualizerViewProps> {
	private props: EqualizerViewProps = { level: 0, status: "recording" };
	private readonly history = new Float32Array(HISTORY_CAP);
	private head = 0;
	private size = 0;
	private lastPushed: number | undefined;

	constructor(private readonly theme: Theme) {}

	setProps(props: EqualizerViewProps): void {
		// adapter.apply() fires setProps for every state change (including key
		// presses that don't move the mic level). Dedupe so non-audio state
		// changes don't pollute the rolling history with stale samples.
		if (props.status === "recording" && props.level !== this.lastPushed) {
			this.push(props.level);
			this.lastPushed = props.level;
		}
		this.props = props;
	}

	handleInput(_data: string): void {}

	invalidate(): void {}

	render(width: number): string[] {
		if (width <= 0) return [""];
		const cap = Math.min(width, HISTORY_CAP);
		const cells: string[] = new Array(width);
		for (let col = 0; col < width; col++) {
			// Latest sample on the right; older samples scroll leftward.
			const sampleAge = width - 1 - col;
			if (sampleAge >= cap || sampleAge >= this.size) {
				cells[col] = " ";
				continue;
			}
			const idx = (this.head - 1 - sampleAge + HISTORY_CAP) % HISTORY_CAP;
			cells[col] = BAR_GLYPHS[glyphIndexFor(this.history[idx] ?? 0)];
		}
		const colorKey = this.props.status === "recording" ? COLOR_ACCENT : COLOR_DIM;
		return [this.theme.fg(colorKey, cells.join(""))];
	}

	private push(v: number): void {
		this.history[this.head] = v;
		this.head = (this.head + 1) % HISTORY_CAP;
		if (this.size < HISTORY_CAP) this.size++;
	}
}

function glyphIndexFor(level: number): number {
	if (level <= 0) return 0;
	const scaled = Math.min(1, Math.sqrt(level * PERCEPTUAL_GAIN));
	return Math.round(scaled * (BAR_GLYPHS.length - 1));
}
