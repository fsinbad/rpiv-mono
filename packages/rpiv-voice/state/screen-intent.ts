import type { ScreenKind } from "./state.js";

export type FooterHintKey =
	| "enter_paste"
	| "space_pause"
	| "tab_settings"
	| "esc_cancel"
	| "esc_back"
	| "ctrl_s_save"
	| "enter_toggle";

export interface ScreenIntentMeta {
	label: string;
	showsEqualizer: boolean;
	showsTranscript: boolean;
	showsSettingsForm: boolean;
	footerHints: readonly FooterHintKey[];
}

export const SCREEN_META: Record<ScreenKind, ScreenIntentMeta> = {
	dictation: {
		label: "Dictation",
		showsEqualizer: true,
		showsTranscript: true,
		showsSettingsForm: false,
		footerHints: ["enter_paste", "space_pause", "tab_settings", "esc_cancel"],
	},
	settings: {
		label: "Settings",
		showsEqualizer: false,
		showsTranscript: false,
		showsSettingsForm: true,
		footerHints: ["enter_toggle", "ctrl_s_save", "esc_back"],
	},
};
