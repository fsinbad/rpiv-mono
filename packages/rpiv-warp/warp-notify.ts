/**
 * rpiv-warp — OSC 777 transport.
 *
 * Writes Warp's structured notification escape sequence to /dev/tty.
 * Each `writeOSC777` call opens, writes, and closes the fd — no fd cache
 * (matches bash precedent: warp-notify.sh:21).
 *
 * Tests intercept fs calls via `vi.mock("node:fs", ...)` — the same
 * pattern used in `packages/rpiv-pi/extensions/rpiv-core/pi-installer.test.ts:4`
 * for `node:child_process`. Production uses `import * as fs from "node:fs"`
 * for clarity (every fs call is namespace-prefixed).
 */

import * as fs from "node:fs";

// ---------------------------------------------------------------------------
// OSC byte sequence — exported so tests assert against the same constants
// ---------------------------------------------------------------------------

export const OSC_INTRODUCER = "\x1b]";
export const OSC_TERMINATOR = "\x07";
export const OSC_777_PREFIX = "777;notify";

const TTY_PATH = "/dev/tty";

export function formatOSC777(title: string, body: string): string {
	return `${OSC_INTRODUCER}${OSC_777_PREFIX};${title};${body}${OSC_TERMINATOR}`;
}

// ---------------------------------------------------------------------------
// Platform / fs primitives — small wrappers so writeOSC777 reads as a sentence
// ---------------------------------------------------------------------------

function isWindows(): boolean {
	return process.platform === "win32";
}

function openTty(): number {
	return fs.openSync(TTY_PATH, "w");
}

function writeBytes(fd: number, bytes: string): void {
	fs.writeSync(fd, bytes);
}

function closeQuietly(fd: number): void {
	try {
		fs.closeSync(fd);
	} catch {
		/* fd already closed or invalid — ignore */
	}
}

// ---------------------------------------------------------------------------
// Public emitter — silent skip on any failure (no-tty, sandbox, broken Warp)
// ---------------------------------------------------------------------------

export function writeOSC777(title: string, body: string): void {
	if (isWindows()) return;
	let fd: number | undefined;
	try {
		fd = openTty();
		writeBytes(fd, formatOSC777(title, body));
	} catch {
		/* silent skip — matches bash `warp-notify.sh:21` */
	} finally {
		if (fd !== undefined) closeQuietly(fd);
	}
}
