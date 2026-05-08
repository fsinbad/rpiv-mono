/**
 * model-download — fetches the multilingual Whisper base model archive into
 * `~/.pi/models/whisper-base/`, extracts it, prunes unused fp32 duplicates,
 * and writes a sentinel file marking the install complete.
 *
 * The upstream archive ships BOTH fp32 (~290 MB) and int8 (~155 MB) variants
 * in one tarball. We use int8 for CPU inference, so we delete the fp32
 * duplicates after extraction to keep on-disk usage to ~157 MB.
 *
 * Progress is surfaced phase-by-phase (downloading → extracting → verifying);
 * we deliberately don't forward per-chunk fetch progress, because callers
 * pipe phase strings into a single-line ctx.ui.setStatus and per-chunk would
 * spam the status surface.
 */

import { execFile } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { t } from "../state/i18n-bridge.js";

const execFileAsync = promisify(execFile);

// ── Paths ────────────────────────────────────────────────────────────────────
const MODEL_DIR_NAME = "whisper-base";
export const MODELS_DIR = join(homedir(), ".pi", "models");
export const WHISPER_BASE_DIR = join(MODELS_DIR, MODEL_DIR_NAME);
export const SENTINEL_FILE = ".download-complete";

// ── Source archive ───────────────────────────────────────────────────────────
const MODEL_RELEASE_TAG = "asr-models";
const MODEL_ARCHIVE_NAME = "sherpa-onnx-whisper-base.tar.bz2";
const MODEL_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/${MODEL_RELEASE_TAG}/${MODEL_ARCHIVE_NAME}`;
const APPROX_DOWNLOAD_MB = 198;

// ── Files we keep (int8 quantized) ──────────────────────────────────────────
const ENCODER_FILE = "base-encoder.int8.onnx";
const DECODER_FILE = "base-decoder.int8.onnx";
const TOKENS_FILE = "base-tokens.txt";
const REQUIRED_FILES: readonly string[] = [ENCODER_FILE, DECODER_FILE, TOKENS_FILE];

// ── Files we delete after extraction (fp32 dupes we don't need on CPU) ──────
const FP32_ENCODER_FILE = "base-encoder.onnx";
const FP32_DECODER_FILE = "base-decoder.onnx";
const FP32_DUPLICATE_FILES: readonly string[] = [FP32_ENCODER_FILE, FP32_DECODER_FILE];

// ── Tar invocation ───────────────────────────────────────────────────────────
const TAR_BIN = "tar";
// `--strip-components=1` flattens sherpa's top-level wrapper directory so the
// REQUIRED_FILES land directly inside WHISPER_BASE_DIR.
const TAR_FLAGS: readonly string[] = ["-xjf"];
const TAR_STRIP_FLAG = "--strip-components=1";

// ── Status messages ──────────────────────────────────────────────────────────
// Resolved at progress-emit time (not module load) so live `/languages` flips
// take effect mid-download.
const msgDownloading = (): string =>
	t("splash.downloading", `Downloading Whisper base multilingual (~${APPROX_DOWNLOAD_MB} MB)…`);
const msgExtracting = (): string => t("splash.extracting", "Extracting model files…");
const msgVerifying = (): string => t("splash.verifying", "Verifying model files…");

// ── Public API ───────────────────────────────────────────────────────────────

export interface DownloadProgress {
	phase: "downloading" | "extracting" | "verifying";
	percent?: number;
	message?: string;
}
export type ProgressCallback = (progress: DownloadProgress) => void;

export interface ModelPaths {
	encoderPath: string;
	decoderPath: string;
	tokensPath: string;
}

export function isModelDownloaded(): boolean {
	return existsSync(join(WHISPER_BASE_DIR, SENTINEL_FILE));
}

export function getModelPaths(): ModelPaths {
	return {
		encoderPath: join(WHISPER_BASE_DIR, ENCODER_FILE),
		decoderPath: join(WHISPER_BASE_DIR, DECODER_FILE),
		tokensPath: join(WHISPER_BASE_DIR, TOKENS_FILE),
	};
}

export async function ensureModelDownloaded(onProgress: ProgressCallback, signal?: AbortSignal): Promise<ModelPaths> {
	if (isModelDownloaded()) return getModelPaths();

	mkdirSync(WHISPER_BASE_DIR, { recursive: true });
	const archivePath = join(WHISPER_BASE_DIR, MODEL_ARCHIVE_NAME);

	onProgress({ phase: "downloading", message: msgDownloading() });
	await downloadArchive(MODEL_URL, archivePath, signal);

	onProgress({ phase: "extracting", message: msgExtracting() });
	await extractArchive(archivePath, WHISPER_BASE_DIR);
	rmSync(archivePath, { force: true });
	pruneFp32Duplicates();

	onProgress({ phase: "verifying", message: msgVerifying() });
	verifyModelFiles();

	writeSentinel();
	return getModelPaths();
}

// ── Internals ────────────────────────────────────────────────────────────────

async function downloadArchive(url: string, destPath: string, signal?: AbortSignal): Promise<void> {
	const response = await fetch(url, { signal });
	if (!response.ok || !response.body) {
		throw new Error(`Model download failed: HTTP ${response.status}`);
	}
	const out = createWriteStream(destPath);
	await pipeline(Readable.fromWeb(response.body as never), out, { signal });
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
	await execFileAsync(TAR_BIN, [...TAR_FLAGS, archivePath, "-C", destDir, TAR_STRIP_FLAG]);
}

// The Whisper archive ships fp32 + int8 side-by-side (~290 MB of fp32 we
// don't use on CPU). Drop them so the install settles around ~157 MB.
function pruneFp32Duplicates(): void {
	for (const name of FP32_DUPLICATE_FILES) {
		rmSync(join(WHISPER_BASE_DIR, name), { force: true });
	}
}

function verifyModelFiles(): void {
	for (const name of REQUIRED_FILES) {
		if (!existsSync(join(WHISPER_BASE_DIR, name))) {
			throw new Error(`Model verification failed: missing ${name}`);
		}
	}
}

function writeSentinel(): void {
	writeFileSync(join(WHISPER_BASE_DIR, SENTINEL_FILE), "", "utf-8");
}
