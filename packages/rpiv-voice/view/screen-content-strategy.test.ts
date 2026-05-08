import type { Component } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import type { EqualizerViewProps } from "./components/equalizer-view.js";
import type { SettingsFormViewProps } from "./components/settings-form-view.js";
import type { StatusBarViewProps } from "./components/status-bar-view.js";
import type { TranscriptViewProps } from "./components/transcript-view.js";
import { DictationScreenStrategy, SettingsScreenStrategy } from "./screen-content-strategy.js";
import type { StatefulView } from "./stateful-view.js";

function fakeComponent(): Component {
	return {
		render: () => ["fake"],
		invalidate: () => {},
	};
}

function fakeStateful<P>(): StatefulView<P> {
	return {
		...fakeComponent(),
		setProps() {},
		handleInput() {},
	};
}

describe("DictationScreenStrategy", () => {
	it("has kind 'dictation'", () => {
		const strategy = new DictationScreenStrategy({
			transcript: fakeStateful<TranscriptViewProps>(),
			divider: fakeComponent(),
			equalizer: fakeStateful<EqualizerViewProps>(),
			statusBar: fakeStateful<StatusBarViewProps>(),
		});
		expect(strategy.kind).toBe("dictation");
	});

	it("returns [Spacer, transcript, divider, equalizer, statusBar] children", () => {
		const transcript = fakeStateful<TranscriptViewProps>();
		const divider = fakeComponent();
		const equalizer = fakeStateful<EqualizerViewProps>();
		const statusBar = fakeStateful<StatusBarViewProps>();
		const strategy = new DictationScreenStrategy({ transcript, divider, equalizer, statusBar });

		const children = strategy.children();
		expect(children).toHaveLength(5);
		// First child is a Spacer (has render method)
		expect(children[0]).toHaveProperty("render");
		expect(children[1]).toBe(transcript);
		expect(children[2]).toBe(divider);
		expect(children[3]).toBe(equalizer);
		expect(children[4]).toBe(statusBar);
	});
});

describe("SettingsScreenStrategy", () => {
	it("has kind 'settings'", () => {
		const strategy = new SettingsScreenStrategy({
			settingsForm: fakeStateful<SettingsFormViewProps>(),
			divider: fakeComponent(),
			equalizer: fakeStateful<EqualizerViewProps>(),
			statusBar: fakeStateful<StatusBarViewProps>(),
		});
		expect(strategy.kind).toBe("settings");
	});

	it("returns [Spacer, settingsForm, divider, equalizer, statusBar] children", () => {
		const settingsForm = fakeStateful<SettingsFormViewProps>();
		const divider = fakeComponent();
		const equalizer = fakeStateful<EqualizerViewProps>();
		const statusBar = fakeStateful<StatusBarViewProps>();
		const strategy = new SettingsScreenStrategy({ settingsForm, divider, equalizer, statusBar });

		const children = strategy.children();
		expect(children).toHaveLength(5);
		expect(children[1]).toBe(settingsForm);
		expect(children[2]).toBe(divider);
		expect(children[3]).toBe(equalizer);
		expect(children[4]).toBe(statusBar);
	});
});
