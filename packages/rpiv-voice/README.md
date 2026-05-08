# rpiv-voice

[![npm version](https://img.shields.io/npm/v/@juicesharp/rpiv-voice.svg)](https://www.npmjs.com/package/@juicesharp/rpiv-voice)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Voice dictation for [Pi Agent](https://github.com/badlogic/pi-mono). Adds a `/voice` slash command that opens a TUI overlay with a live equalizer, captures microphone audio with [`decibri`](https://www.npmjs.com/package/decibri), transcribes locally via [`sherpa-onnx`](https://github.com/k2-fsa/sherpa-onnx) (Whisper base multilingual int8, ~198 MB download / ~157 MB on disk, auto-downloaded on first use), and pastes the transcript into Pi's editor on `Enter`. Supports the full Whisper language set (~99 languages) with autodetection per utterance.

Everything runs on-device: no cloud STT, no telemetry, no API keys.

## Install

`rpiv-voice` is **not** part of the default `/rpiv-setup` bundle — the native deps are heavyweight, so it's opt-in:

```sh
pi install npm:@juicesharp/rpiv-voice
```

## Usage

1. Type `/voice` in Pi's input → overlay appears with equalizer and `Listening…`
2. Speak → equalizer animates, transcript fills in live (Silero VAD chunks on silence)
3. `Enter` → overlay closes, text pastes into the editor
4. `Esc` → overlay closes, nothing pastes
5. `Space` → toggle pause / resume

First invocation downloads the Whisper base multilingual model into `~/.pi/models/whisper-base/` with a single-line phase-only status (`Downloading… → Extracting… → Verifying…`). Subsequent runs load from disk.

## Configuration

Optional `~/.config/rpiv-voice/voice.json`:

```json
{
  "hallucinationFilterEnabled": false
}
```

The single field is optional. Omit the file to use defaults. `hallucinationFilterEnabled` defaults to `true` — set to `false` to keep Whisper's "Thanks for watching"/"[Music]"/loop output (useful when dictating short single words). The microphone is the OS default input; rpiv-voice does not expose device selection. The bundled Whisper base multilingual model is loaded from `~/.pi/models/whisper-base/` and cannot be overridden today.

## Requirements

- Pi Agent CLI (`@earendil-works/pi-coding-agent`)
- A working microphone reachable by `decibri`
- Network access on first run (model download)

## License

MIT — see [LICENSE](./LICENSE).
