# @juicesharp/rpiv-args

Pi extension that extends Pi's skill-argument resolving mechanism without
breaking the current contract.

When you invoke `/skill:<name> <args>` at the prompt, Pi wraps the skill body
in a `<skill …>…</skill>` block and appends your raw args after it. `rpiv-args`
pre-empts that wrapping via the `input` event so that any placeholders inside
the skill body — `$1`, `$ARGUMENTS`, `$@`, `${@:2}`, `${@:2:3}` — are
substituted before the block reaches the LLM.

## Backward compatibility

If a skill body contains **no** placeholders (the current state of all 17
rpiv-pi skills), `rpiv-args` emits a block byte-identical to Pi's built-in
wrapper. Your existing skills continue to work unchanged.

## Known limitation

Messages queued via `session.steer()` or `session.followUp()` run Pi's
built-in skill expansion but do **not** emit the `input` event
(`node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js:861-887`).
Placeholders in skill bodies are therefore **not resolved** on those paths.
Use the primary prompt path for argument-substituted skill invocations.

## Install

```
/rpiv-setup
```

or manually:

```
pi install npm:@juicesharp/rpiv-args
```

## License

MIT
