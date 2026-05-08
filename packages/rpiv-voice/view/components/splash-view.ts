import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { t } from "../../state/i18n-bridge.js";
import type { StatefulView } from "../stateful-view.js";

export const SPLASH_FRAMES = ["⠴", "⠦", "⠖", "⠲"] as const;
export const SPLASH_FRAME_INTERVAL_MS = 160;

export type SplashPhase =
	| { kind: "downloading"; message: string }
	| { kind: "extracting"; message: string }
	| { kind: "verifying"; message: string }
	| { kind: "loading_engine" }
	| { kind: "initializing_mic" };

export interface SplashViewProps {
	phase: SplashPhase;
	frame: number;
}

const TRUNCATE_ELLIPSIS = "…";

const COLOR_ACCENT = "accent";
const COLOR_MUTED = "muted";

function phaseLabel(phase: SplashPhase): string {
	switch (phase.kind) {
		case "downloading":
		case "extracting":
		case "verifying":
			return phase.message;
		case "loading_engine":
			return t("splash.loading_engine", "Loading speech model…");
		case "initializing_mic":
			return t("splash.initializing_mic", "Initializing microphone…");
	}
}

/**
 * Splash chrome mirrors the in-session layout: a divider line on top followed
 * by a single status line. The status line uses the same `${glyph} ${label}`
 * shape as `StatusBarView` (`● 0:42 …`) — a leading colored glyph, single
 * space, then a muted label — so the splash feels like a quieter sibling of
 * the dictation/settings chrome rather than a separate widget.
 */
export class SplashView implements StatefulView<SplashViewProps> {
	private readonly divider: DynamicBorder;
	private props: SplashViewProps = { phase: { kind: "loading_engine" }, frame: 0 };

	constructor(private readonly theme: Theme) {
		this.divider = new DynamicBorder((s) => theme.fg(COLOR_ACCENT, s));
	}

	setProps(props: SplashViewProps): void {
		this.props = props;
	}

	handleInput(_data: string): void {}

	invalidate(): void {}

	render(width: number): string[] {
		const frameChar = SPLASH_FRAMES[this.props.frame % SPLASH_FRAMES.length];
		const spinner = this.theme.fg(COLOR_ACCENT, frameChar);
		const label = this.theme.fg(COLOR_MUTED, phaseLabel(this.props.phase));
		const statusLine = `${spinner} ${label}`;
		return [...this.divider.render(width), truncateToWidth(statusLine, width, TRUNCATE_ELLIPSIS, false)];
	}
}
