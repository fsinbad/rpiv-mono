export type RecordingStatus = "recording" | "paused";
export type ScreenKind = "dictation" | "settings";

export interface SettingsDraft {
	hallucinationFilterEnabled: boolean;
}

export interface VoiceState {
	currentScreen: ScreenKind;
	status: RecordingStatus;
	transcript: string;
	audioLevel: number;
	/** In-flight editor draft — not persisted until `settings_save`. */
	settingsDraft: SettingsDraft;
}

export interface VoiceRuntime {
	keybindings: { matches(data: string, name: string): boolean };
}

export function initialVoiceState(draft: SettingsDraft): VoiceState {
	return {
		currentScreen: "dictation",
		status: "recording",
		transcript: "",
		audioLevel: 0,
		settingsDraft: draft,
	};
}
