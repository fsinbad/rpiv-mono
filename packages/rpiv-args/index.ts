/**
 * rpiv-args — Pi extension entry point.
 *
 * Registers the `input` event handler + a `session_start` cache invalidator.
 * All logic lives in args.ts.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerArgsHandler } from "./args.js";

export default function (pi: ExtensionAPI): void {
	registerArgsHandler(pi);
}
