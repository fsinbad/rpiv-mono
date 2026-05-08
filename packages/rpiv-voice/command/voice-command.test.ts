import { describe, expect, it, vi } from "vitest";

import { registerVoiceCommand, VOICE_COMMAND_NAME } from "./voice-command.js";

describe("VOICE_COMMAND_NAME", () => {
	it("exports 'voice'", () => {
		expect(VOICE_COMMAND_NAME).toBe("voice");
	});
});

describe("registerVoiceCommand", () => {
	it("calls pi.registerCommand with the voice command name", () => {
		const registerCommand = vi.fn();
		const pi = { registerCommand } as never;
		registerVoiceCommand(pi);
		expect(registerCommand).toHaveBeenCalledOnce();
		expect(registerCommand.mock.calls[0][0]).toBe("voice");
		expect(registerCommand.mock.calls[0][1]).toHaveProperty("handler");
		expect(typeof registerCommand.mock.calls[0][1].handler).toBe("function");
	});

	it("handler notifies 'requires interactive mode' when hasUI is false", async () => {
		let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
		const registerCommand = vi.fn((_name: string, spec: { handler: typeof handler }) => {
			handler = spec.handler;
		});
		const pi = { registerCommand } as never;
		registerVoiceCommand(pi);

		const notify = vi.fn();
		const ctx = { hasUI: false, ui: { notify } };
		await handler!("", ctx as never);

		expect(notify).toHaveBeenCalledOnce();
		expect(notify.mock.calls[0][1]).toBe("error");
	});
});
