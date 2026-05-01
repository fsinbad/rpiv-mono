/**
 * rpiv-warp — OSC 777 transport.
 *
 * Writes Warp's structured notification escape sequence to the controlling
 * terminal. On Unix this is `/dev/tty`; on Windows there is no `/dev/tty`,
 * so we write the same OSC bytes to `process.stdout` and rely on ConPTY to
 * forward them to Warp (per Warp's "Bringing Warp to Windows" eng blog:
 * "ConPTY will send even unrecognized OSCs to the shell").
 *
 * Each `writeOSC777` call on Unix opens, writes, and closes the fd — no fd
 * cache (matches bash precedent: warp-notify.sh:21). Windows writes go
 * straight through `process.stdout.write` — best-effort, untested in the
 * wild as no Warp plugin currently ships a Windows transport.
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

// Windows transport — write OSC bytes to stdout so ConPTY forwards them to
// Warp. Skipped when stdout isn't a TTY (piped/redirected output would either
// pollute downstream consumers or never reach the terminal).
function writeStdout(bytes: string): void {
	if (!process.stdout.isTTY) return;
	process.stdout.write(bytes);
}

// ---------------------------------------------------------------------------
// Public emitter — silent skip on any failure (no-tty, sandbox, broken Warp)
// ---------------------------------------------------------------------------

export function writeOSC777(title: string, body: string): void {
	const seq = formatOSC777(title, body);
	if (isWindows()) {
		try {
			writeStdout(seq);
		} catch {
			/* silent skip — best-effort on Windows */
		}
		return;
	}
	let fd: number | undefined;
	try {
		fd = openTty();
		writeBytes(fd, seq);
	} catch {
		/* silent skip — matches bash `warp-notify.sh:21` */
	} finally {
		if (fd !== undefined) closeQuietly(fd);
	}
}
