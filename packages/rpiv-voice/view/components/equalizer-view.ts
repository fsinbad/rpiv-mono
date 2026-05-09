import type { Theme } from "@earendil-works/pi-coding-agent";
import type { RecordingStatus } from "../../state/state.js";
import type { StatefulView } from "../stateful-view.js";

const COLOR_ACCENT = "accent";
const COLOR_MUTED = "muted";
const COLOR_DIM = "dim";

// Lower-block glyph ladder: each cell fills from its baseline upward in
// eighths. Used for BOTH cell rows now — the bottom row fills first, the top
// row continues filling above it, giving us 16 distinct amplitude steps
// (vs. 8 in the old mirrored design) for the same two-row chrome height.
const BAR_GLYPHS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;
const SUB_LEVELS_PER_ROW = BAR_GLYPHS.length - 1; // 8 — the highest non-empty index
const MAX_AMP = SUB_LEVELS_PER_ROW * 2; // 16 sub-levels stacked across two rows

// Perceptual gain on the live RMS reading. RMS for normal speech sits around
// 0.02–0.15; sqrt(level * 5) reaches roughly 0.7 at quiet talking volume and
// saturates on loud peaks.
const PERCEPTUAL_GAIN = 5;

// Single-pole low-pass on `level`. Half-life ~25 ms at 10 Hz updates — fast
// enough that loud peaks visibly punch through, slow enough to suppress the
// glyph-quantization shimmer.
const SMOOTHING = 0.3;

// Trapezoid envelope: flat plateau across the middle PLATEAU_HALF_WIDTH × 2 of
// the row, linear fade to zero over FADE_WIDTH on each side, hard zero past
// that. This is the cover-art silhouette: confident centred bell with tails
// that go fully blank, so the equalizer never reads as filling the whole row.
const PLATEAU_HALF_WIDTH = 0.4;
const FADE_WIDTH = 0.08;

// Per-column noise floor on the static envelope. Keeps adjacent bars at
// different heights even when held at peak so the silhouette has texture.
const SHAPE_FLOOR = 0.15;

// Per-tick fall range. Each column draws a deterministic decay rate from
// [FALL_MIN, FALL_MAX] — that's what makes adjacent bars fall back at
// different speeds after a loud onset, so the lattice dances instead of
// pulsing in lockstep. Range is tuned to the canonical voice-meter release
// window: at 10 Hz update rate, FALL_MIN=0.10 ⇒ ~1.0 s tail, FALL_MAX=0.22 ⇒
// ~450 ms. Audio-engineering literature (IEC 60268-17 / BS 6840 PPM) puts the
// "feels alive on speech" sweet spot at 300–500 ms release, faster than VU's
// 300 ms symmetric and slower than PPM's 1.5 s decay-to-−20 dB.
const FALL_MIN = 0.1;
const FALL_MAX = 0.22;

// Peak-hold latency: every new local maximum latches the column at its peak
// height for HOLD_TICKS frames before the per-column gravity kicks in. At
// 10 Hz tick that is ~600 ms — the recognisable "memory of the loudest recent
// moment" you see in Winamp / classic VU plug-ins. We can't dedicate a
// separate cap row in two-row chrome, so the ballistic lives inside the bar
// itself: the bar freezes briefly at its peak, then resumes its asymmetric
// release.
const HOLD_TICKS = 6;

interface ColumnTuning {
	envelope: number;
	fall: number;
}

export interface EqualizerViewProps {
	level: number;
	status: RecordingStatus;
	enabled: boolean;
}

export class EqualizerView implements StatefulView<EqualizerViewProps> {
	private props: EqualizerViewProps = { level: 0, status: "recording", enabled: false };
	private smoothedLevel = 0;
	private tuning: ColumnTuning[] = [];
	private level: Float64Array = new Float64Array(0);
	// Ticks remaining in each column's peak-hold latch. Reset to HOLD_TICKS
	// every time level[i] rises to a new local max; counts down on every
	// non-rise tick. While > 0 the column's gravity is suppressed.
	private holdLeft: Uint8Array = new Uint8Array(0);
	// Each setProps tick that should advance the lattice queues one step here;
	// render() consumes them. Decoupling keeps render() idempotent for the same
	// audio frame even if the TUI calls it more than once.
	private pendingTicks = 0;

	constructor(private readonly theme: Theme) {}

	setProps(props: EqualizerViewProps): void {
		// Live RMS only feeds the smoother + lattice while recording AND enabled.
		// Pausing freezes the silhouette at its last shape (the dim colour carries
		// the paused state). Disabling drops to zero rows from render() so the
		// dictation pane reclaims the space.
		if (props.enabled && props.status === "recording") {
			this.smoothedLevel = (1 - SMOOTHING) * this.smoothedLevel + SMOOTHING * props.level;
			this.pendingTicks += 1;
		}
		this.props = props;
	}

	handleInput(_data: string): void {}

	invalidate(): void {}

	render(width: number): string[] {
		if (!this.props.enabled) return [];
		if (width <= 0) return ["", ""];

		if (this.tuning.length !== width) {
			this.tuning = buildTuning(width);
			this.level = new Float64Array(width);
			this.holdLeft = new Uint8Array(width);
		}

		const recording = this.props.status === "recording";
		const gain = recording ? Math.min(1, Math.sqrt(this.smoothedLevel * PERCEPTUAL_GAIN)) : 0;
		// Drain queued ticks; while paused pendingTicks is always 0, so the level
		// array holds whatever shape it had at the moment of pause.
		for (let n = 0; n < this.pendingTicks; n++) advanceLevels(this.level, this.holdLeft, this.tuning, gain);
		this.pendingTicks = 0;

		const amps = new Uint8Array(width);
		let topRow = "";
		let botRow = "";
		for (let i = 0; i < width; i++) {
			const amp = quantize(this.level[i] ?? 0);
			amps[i] = amp;
			// Bottom row holds the first SUB_LEVELS_PER_ROW eighths; once it's
			// saturated, the top row picks up the rest. Both rows draw from the
			// same lower-block ladder so the bar visibly grows from the bottom.
			const botIdx = amp >= SUB_LEVELS_PER_ROW ? SUB_LEVELS_PER_ROW : amp;
			const topIdx = amp > SUB_LEVELS_PER_ROW ? amp - SUB_LEVELS_PER_ROW : 0;
			botRow += BAR_GLYPHS[botIdx]!;
			topRow += BAR_GLYPHS[topIdx]!;
		}

		return [this.paint(topRow, amps, recording), this.paint(botRow, amps, recording)];
	}

	// Run-length encode the row into theme.fg() segments — one segment per
	// contiguous run of cells that share the same shade tier. Paused state
	// collapses to a single dim segment, matching the "frozen, gone quiet"
	// semantic the rest of the overlay uses.
	private paint(row: string, amps: Uint8Array, recording: boolean): string {
		if (!recording) return this.theme.fg(COLOR_DIM, row);
		const width = row.length;
		if (width === 0) return "";
		const cells = [...row];
		let out = "";
		let runStart = 0;
		let currentShade = pickShade(amps[0] ?? 0);
		for (let i = 1; i < width; i++) {
			const shade = pickShade(amps[i] ?? 0);
			if (shade !== currentShade) {
				out += this.theme.fg(currentShade, cells.slice(runStart, i).join(""));
				runStart = i;
				currentShade = shade;
			}
		}
		out += this.theme.fg(currentShade, cells.slice(runStart).join(""));
		return out;
	}
}

// Three-tier shade picker over the 0..MAX_AMP amplitude range. Splits roughly
// thirds: lower bottom-row eighths render dim, the upper bottom-row + lower
// top-row eighths render muted, anything in the upper top-row burns accent.
function pickShade(amp: number): "dim" | "muted" | "accent" {
	if (amp <= 5) return COLOR_DIM;
	if (amp <= 10) return COLOR_MUTED;
	return COLOR_ACCENT;
}

function buildTuning(width: number): ColumnTuning[] {
	const out: ColumnTuning[] = new Array(width);
	for (let i = 0; i < width; i++) {
		const t = width === 1 ? 0.5 : i / (width - 1);
		const envelope = trapezoidEnvelope(t) * columnShape(i);
		const fall = FALL_MIN + columnHash(i) * (FALL_MAX - FALL_MIN);
		out[i] = { envelope, fall };
	}
	return out;
}

// Rise-fast / hold / fall-slow per column. The latch refreshes on every
// rising-or-stable tick so sustained loud audio keeps the column pinned to
// peak; only when target drops below prev does the HOLD_TICKS countdown
// start, and only after it expires does the column-specific gravity (release
// time) take over. End result: bars freeze at the loudest recent moment for
// ~600 ms, then start dropping at their per-column rates — the classic
// peak-hold ballistic of Winamp-class meters.
function advanceLevels(level: Float64Array, holdLeft: Uint8Array, tuning: ColumnTuning[], gain: number): void {
	for (let i = 0; i < level.length; i++) {
		const t = tuning[i]!;
		const target = gain * t.envelope;
		const prev = level[i]!;
		if (target >= prev) {
			level[i] = target;
			holdLeft[i] = HOLD_TICKS;
		} else if (holdLeft[i]! > 0) {
			holdLeft[i] = holdLeft[i]! - 1;
		} else {
			level[i] = Math.max(0, prev - t.fall);
		}
	}
}

// Trapezoid centered at t=0.5: flat 1.0 across [0.5±PLATEAU_HALF_WIDTH], linear
// fade to 0 over the next FADE_WIDTH, then hard zero at the very edges.
function trapezoidEnvelope(t: number): number {
	const d = Math.abs(t - 0.5);
	if (d <= PLATEAU_HALF_WIDTH) return 1;
	const fadeT = (d - PLATEAU_HALF_WIDTH) / FADE_WIDTH;
	if (fadeT >= 1) return 0;
	return 1 - fadeT;
}

// Deterministic per-column multiplier in [SHAPE_FLOOR, 1]. Two hash phases are
// summed so adjacent columns vary like a frozen audio snapshot — dense peaks
// and dips, no obvious periodicity.
function columnShape(i: number): number {
	const a = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
	const b = Math.sin(i * 7.523 + 41.31) * 13371.337;
	const fa = a - Math.floor(a);
	const fb = b - Math.floor(b);
	const f = (fa + fb) / 2;
	return SHAPE_FLOOR + (1 - SHAPE_FLOOR) * f;
}

// Independent per-column [0, 1) hash for fall rates — different sine phases
// from columnShape so envelope-tall columns don't all share a single fall
// speed.
function columnHash(i: number): number {
	const a = Math.sin(i * 97.13 + 12.345) * 43758.5453;
	return a - Math.floor(a);
}

function quantize(level: number): number {
	const idx = Math.round(level * MAX_AMP);
	return idx < 0 ? 0 : idx > MAX_AMP ? MAX_AMP : idx;
}
