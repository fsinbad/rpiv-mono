import type { Theme } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { StatefulView } from "../stateful-view.js";

const COLOR_MUTED = "muted";

export interface TranscriptViewProps {
	text: string;
	placeholder: string;
}

export class TranscriptView implements StatefulView<TranscriptViewProps> {
	private props: TranscriptViewProps = { text: "", placeholder: "Listening..." };

	constructor(private readonly theme: Theme) {}

	setProps(props: TranscriptViewProps): void {
		this.props = props;
	}

	handleInput(_data: string): void {}

	invalidate(): void {}

	render(width: number): string[] {
		if (!this.props.text) {
			return [this.theme.fg(COLOR_MUTED, this.props.placeholder)];
		}
		const lines: string[] = [];
		for (const ln of this.props.text.split("\n")) {
			const src = ln.length === 0 ? " " : ln;
			lines.push(...wrapTextWithAnsi(src, width));
		}
		return lines;
	}
}
