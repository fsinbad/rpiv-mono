---
date: 2026-04-17T23:01:31-04:00
researcher: Claude Code
git_commit: 0c8320ba8cdf805445da2828714f21b4b59046e9
branch: main
repository: rpiv-pi
topic: "/btw side-question slash command — Pi extension requirements (sibling to rpiv-advisor)"
tags: [research, codebase, btw, slash-command, side-conversation, extension, rpiv-advisor, pi-subagents, overlay]
status: complete
questions_source: "thoughts/shared/questions/2026-04-17_21-39-56_btw-extension-requirements.md"
last_updated: 2026-04-17
last_updated_by: Claude Code
---

# Research: `/btw` Side-Question Slash Command Extension

## Research Question

Design a `/btw <question>` Pi slash-command extension — a sibling to `@juicesharp/rpiv-advisor` — that asks the same primary model a one-off side question using the cloned primary conversation as context. The main agent must continue working; the side answer must not pollute the main conversation; history threads across `/btw` calls within a session; rendered as a bottom-slot overlay with `↑/↓` scroll, `x` clear history, `Esc` dismiss (fork `f` deferred to post-MVP).

## Summary

`/btw` should be built as a **standalone advisor-style extension** (Path A) using `completeSimple` from `@mariozechner/pi-ai` directly, NOT as a wrapper around `@tintinweb/pi-subagents` (Path B/C). Pi-subagents has no "share parent `messages[]` by reference" mode — its closest primitive (`inherit_context: true`) text-serializes the parent branch as a prose block prepended to the prompt, drops tool results, and spawns a full agentic loop with a fresh `SessionManager.inMemory()`. `/btw`'s semantics (single-shot, tools denied, ephemeral answer, prompt-cache-friendly) map cleanly to `completeSimple(model, {systemPrompt, messages, tools: []}, {signal: ownController.signal})`.

Key architectural decisions, locked in during the developer checkpoint:
1. **Direct `completeSimple` call** — no subagent wrapper. Bypass pi-subagents' agent-loop/widget/output-file machinery.
2. **Raw `convertToLlm(branch)` messages** passed as real multi-turn structure (competitor-parity), not serialized prose. `messages: [...convertToLlm(branch), ...threadedBtwHistory, {role:"user", content: sideQuestion}]`.
3. **Module-level `btwHistory: {q,a}[]`** threads prior `/btw` Q+A into each subsequent call. Automatically resets on `newSession`/`fork`/`reload` because `extensions/loader.js:225, 231` re-imports extension modules with `moduleCache: false`. Explicit `x` key clears mid-session.
4. **Bottom-slot overlay** via `ctx.ui.custom` with `overlayOptions: { anchor: "bottom-center", width: "100%" }` (confirmed in `pi-tui/dist/tui.d.ts:59, 75-102`). Borderless, plain prose, no `DynamicBorder`.
5. **Ephemeral answer** — answer never enters `agent.state.messages`. Critical finding: `sendMessage({display: false})` does NOT hide from LLM context; it only hides from TUI. The only true "side conversation" sinks are `ctx.ui.custom` (transient) or `pi.appendEntry` (persisted but not LLM-visible).
6. **Cache-safe snapshot** on `pi.on("message_end", ...)` gated on `AssistantMessage.stopReason !== "toolUse"` — mirrors competitor's `handleStopHooks()` semantics.
7. **Audit persistence** via `pi.appendEntry("btw:sidechain", {uuid, q, a, ts})` — parent-session-scoped, survives resume via transcript replay, mirrors pi-subagents' `subagents:record` pattern.
8. **Own `AbortController`** — `ctx.signal` is bound to the MAIN AGENT (`agent-session.js:1758` → `agent.signal` at `agent.js:304`); forwarding it couples `/btw` cancellation to the main turn. Wire Esc via `ctx.ui.onTerminalInput` (`types.d.ts:65`).
9. **Package**: new sibling `@juicesharp/rpiv-btw` with thin `index.ts` + `btw.ts` + `btw-ui.ts` + `prompts/btw-system.md`. Peer-deps on `pi-ai`, `pi-coding-agent`, `pi-tui` (overlay). ONE entry added to `rpiv-pi/extensions/rpiv-core/siblings.ts` and ONE line to `rpiv-pi/package.json#peerDependencies`. No `session_start`, no `before_agent_start`, no disk persistence.
10. **Known gap**: byte-identical prompt-cache parity with the competitor is NOT achievable via `completeSimple` today. pi-ai's `anthropic.js:386-465` constructs a fresh SDK client and applies its own cache-breakpoint logic per call. Acceptable for MVP; future upstream pi-ai PR could expose `{ preserveCacheBreakpoints: true }`.

## Detailed Findings

### Request Path (end-to-end)

`/btw <question>` dispatches synchronously even mid-stream of the main agent:

- `interactive-mode.js:1741` — `defaultEditor.onSubmit(text)` handler
- `interactive-mode.js:1894-1900` — streaming branch: `await this.session.prompt(text, { streamingBehavior: "steer" })`
- `agent-session.js:672-681` — detects `/` prefix, routes to `_tryExecuteExtensionCommand` **before** any steer/followUp queue logic. JSDoc at `agent-session.js:660`: *"Handles extension commands (registered via pi.registerCommand) immediately, even during streaming"*
- `agent-session.js:796-821` — `_tryExecuteExtensionCommand` calls `command.handler(args, ctx)` on the spot
- `agent-session.js:922-931` — `_throwIfExtensionCommand` EXPLICITLY REJECTS queuing; `/btw` cannot be steered or follow-upped

Handler signature (verified at `types.d.ts:693`):
```
handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
```

Main agent's turn runs on an independent `activeRun.promise` (`agent.js:300-322`). System-reminder claim "main agent is NOT interrupted" is accurate at the agent-turn level. **But**: the TUI editor's `onSubmit` awaits the handler — so the input editor is blocked until `/btw` resolves (not the agent). Confirmed at `interactive-mode.js:1897`.

### Context Cloning (primary conversation)

Two proven shapes exist; locked to raw Message[] for competitor parity:

- `ctx.sessionManager.getBranch()` returns `SessionEntry[]` (`session-manager.d.ts:244`)
- `.filter((e): e is SessionEntry & {type:"message"} => e.type === "message").map(e => e.message)` → `AgentMessage[]`
- `convertToLlm(agentMessages)` (`messages.js:75-122`) → LLM `Message[]`. Per-role transforms:
  - `bashExecution` → user message via `bashExecutionToText` (`messages.js:21-39, 80-83`); `excludeFromContext` entries dropped
  - `custom` → user message unconditionally (`messages.js:89-96`); display flag ignored at this layer
  - `branchSummary` / `compactionSummary` → user-role with `BRANCH_SUMMARY_PREFIX/SUFFIX` wrapping (`messages.js:97-110, 7-17`)
  - `user`, `assistant`, `toolResult` → pass-through
- `serializeConversation(messages)` in `compaction/utils.js:93-146` — **NOT USED by /btw** (competitor uses raw messages, not prose). Reference only: it emits `[User]:`, `[Assistant]:`, `[Assistant thinking]:`, `[Assistant tool calls]:`, `[Tool result]:` lines truncated at 2000 chars per `utils.js:73-84`. Advisor uses this at `advisor.ts:253`.

**Why raw messages[] over serialized prose**: competitor's `runForkedAgent()` passes `initialMessages = [...forkContextMessages, ...promptMessages]` (same Message object references → byte-identical prefix → prompt-cache hit). Closest pi equivalent: `messages: [...convertToLlm(branch), ...threadedBtwHistory, {role:"user", content: sideQuestion}]`. Risks (documented): unbounded token cost, possible consecutive-user-role provider rejection (convertToLlm does not merge adjacent same-role entries), model may try to "continue" prior assistant's work — counter with explicit system prompt wording.

### `/btw` History Threading

Module-level state in `btw.ts`:

```
let btwHistory: { q: string; a: string; ts: number }[] = [];
```

- **Persists within session**: survives across multiple `/btw` calls in the same session (same process, same extension module instance)
- **Resets on newSession/fork/reload**: `agent-session-runtime.js:103-126` tears down via `teardownCurrent()` → `createRuntime(...)` → `resource-loader.js:273` → `loadExtensions(...)` → `extensions/loader.js:224-231` with `jiti moduleCache: false`. Extension module is re-imported; `let btwHistory = []` resets.
- **Survives across session resume** ONLY if persisted via `pi.appendEntry("btw:sidechain", ...)` and re-read from the branch on `session_start` (the pattern pi-subagents uses — `@tintinweb/pi-subagents/src/index.ts:376-380` writes `pi.appendEntry("subagents:record", {...})` on completion; survival is because the parent session transcript persists, not because pi-subagents has its own store)

Injection into messages for each `/btw` call:
```
messages = [
  ...convertToLlm(branch),
  ...btwHistory.flatMap(h => [
    {role:"user", content: [{type:"text", text: h.q}]},
    {role:"assistant", content: [{type:"text", text: h.a}]},
  ]),
  {role:"user", content: [{type:"text", text: sideQuestion}]},
]
```

### Output Sink — The Critical Finding

**`sendMessage({display: false})` does NOT hide from LLM context. It hides only from TUI rendering.**

Definitive evidence:
- `interactive-mode.js:2225-2233` — `if (message.display)` gates adding the component to chat (the only `display` check for rendering)
- `export-html/template.js:1215` — second rendering gate (HTML export)
- `session-manager.js:167-177, 171-172` — `buildSessionContext` converts `custom_message` entries via `createCustomMessage(..., entry.display, ...)` for ALL custom messages on the path, regardless of flag
- `compaction/compaction.js:49-50`, `compaction/branch-summarization.js:70-71` — same treatment during compaction
- `messages.js:89-96` — `convertToLlm` case `"custom"` emits user-role LLM message unconditionally; no `m.display` check
- `agent-session.js:294-297, 944-973` — `sendCustomMessage` writes to `agent.state.messages` and persists via `appendCustomMessageEntry`; no filtering on send

Corollary: even `display:false` would push `/btw` Q+A into LLM context on the main agent's next turn. **Only** `ctx.ui.custom` (ephemeral, never persisted) and `pi.appendEntry` (persisted but `Does NOT participate in LLM context` per `session-manager.d.ts:65-69`) achieve true side-conversation semantics.

Developer decision: **`ctx.ui.custom` overlay** (ephemeral read) + **`pi.appendEntry("btw:sidechain", ...)`** (audit / resume survival).

### Overlay — Bottom-Slot Placement

Confirmed feasible via `OverlayOptions` at `pi-tui/dist/tui.d.ts:75-102`:
- `OverlayAnchor = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-center" | "bottom-center" | "left-center" | "right-center"` (tui.d.ts:59)
- `OverlayMargin`: `{top?, right?, bottom?, left?}` (tui.d.ts:63-68)
- `SizeValue = number | "${number}%"`

`/btw` overlay spec:
```
ctx.ui.custom<void>(factory, {
  overlay: true,
  overlayOptions: {
    anchor: "bottom-center",
    width: "100%",
    maxHeight: "50%",
    margin: { left: 0, right: 0, bottom: 0 },
    nonCapturing: false,
  },
})
```

Component tree: plain `Container` + `Text` lines (no `DynamicBorder` — competitor screenshot is borderless). Two rendering regions:
1. Historical `/btw` Q+A (dimmed prefix) from `btwHistory`
2. Current `/btw` Q (accent-highlighted prefix) + answer body (default fg)
3. Footer: `↑/↓ to scroll · x to clear history · Esc to dismiss` (fork deferred)

### Keybindings (MVP)

Four behaviors via `handleInput(data)` in the overlay factory:
- `\x1b` (Esc) — resolve overlay promise with `null`, do nothing else
- `\x1b[A` / `\x1b[B` (↑/↓) — adjust internal `scrollOffset`, render windowed slice
- `"x"` — `btwHistory = []`, `pi.appendEntry("btw:cleared", {ts})`, re-render empty
- `"f"` — deferred to post-MVP (footer may omit or show dimmed)

For cancellation during the `completeSimple` await: own `AbortController` + `ctx.ui.onTerminalInput` listener (`types.d.ts:65`):
```
const controller = new AbortController();
const unsubscribe = ctx.ui.onTerminalInput((data) => {
  if (data === "\x1b") { controller.abort(); return {consume: true}; }
  return undefined;
});
try {
  response = await completeSimple(ctx.model, {systemPrompt, messages, tools: []}, {
    apiKey, headers, signal: controller.signal,
  });
} finally {
  unsubscribe();
}
```

Critical: do NOT forward `ctx.signal` — it equals the MAIN agent's `AbortController.signal` (`runner.js:1758` → `agent-session.js:1043-1047` → `agent.js:304`). Forwarding it would make a main-agent Ctrl+C also kill `/btw`, AND the main agent's own abort would cancel `/btw` mid-answer.

### Snapshot Wiring (Prompt-Cache Best Effort)

Competitor's `handleStopHooks()` fires on `stop_reason !== "tool_use"` turns only, saves `{systemPrompt, messages: [...messagesForQuery, ...assistantMessages]}`. Pi equivalent:

```
let cacheSnapshot: { messages: Message[] } | null = null;

pi.on("message_end", async (event, ctx) => {
  const msg = event.message;
  if (msg.role !== "assistant") return;
  if (msg.stopReason === "toolUse") return;  // retain prior snapshot

  const branch = ctx.sessionManager.getBranch();
  const agentMessages = branch
    .filter((e): e is SessionEntry & { type: "message" } => e.type === "message")
    .map((e) => e.message);
  cacheSnapshot = { messages: convertToLlm(agentMessages) };
});
```

`/btw` handler prefers `cacheSnapshot.messages` over a fresh `getBranch()` read when available. On first `/btw` before any non-tool assistant turn, fall back to live `getBranch()`.

Orphan `tool_use` pairing: not needed in MVP because we skip tool-use turns; the retained snapshot is always well-paired. Only required if we took mid-stream snapshots, which we do not.

### Concurrency Contract

Verified via `agent-session.js:672-681, 860-931` and `pi-ai/stream.js:19-26`:

- `/btw` **runs immediately** even mid-stream; never queued (`agent-session.js:922-931` throws on queue attempts)
- Main agent's turn runs on independent `activeRun.promise` (`agent.js:300-322`); `/btw`'s `completeSimple` is safe to run concurrently
- Each `completeSimple` creates a fresh `Anthropic` SDK client (`anthropic.js:386-465, 416`) with freshly-read API key + headers — no shared state, no auth leak between concurrent calls
- `/btw` **must not call**:
  - `pi.sendMessage(..., {triggerTurn: true})` — re-enters agent loop when idle, steers when streaming
  - `pi.sendMessage(..., {deliverAs: "steer" | "followUp" | "nextTurn"})` — all inject into main agent
  - `pi.sendUserMessage(...)` — always triggers a turn
  - `ExtensionCommandContext` session-control methods (`newSession`, `fork`, `navigateTree`, `switchSession`, `reload`)
- Safe output sinks for MVP: `ctx.ui.custom` (overlay, no state mutation) + `pi.appendEntry("btw:sidechain", {...})` (types.d.ts:762-763; `Does NOT participate in LLM context` per session-manager.d.ts:65-69)

### Prompt Loading

Pi's `prompt-templates` subsystem (`pi-coding-agent/dist/core/prompt-templates.js:168-248`) is **editor-side-only** — it rewrites `/name args` typed by the user into user-message text before the main agent runs. It:
- Discovers `*.md` files from `agentDir/prompts/`, `cwd/.pi/prompts/`, explicit CLI paths (non-recursive)
- Parses frontmatter only for `description` (line 89); ignores `name`, `ccVersion`, `variables`
- Substitutes ONLY `$1..$N`, `$@`, `$ARGUMENTS`, `${@:N:L}` — no named-variable syntax
- Is NOT exported from the public API (`index.d.ts:1-28`); only the `PromptTemplate` TYPE leaks via `sdk.d.ts:53`

`/btw` cannot reuse pi's template engine for its internal `systemPrompt`. Use advisor's simple pattern at `advisor.ts:137-140`:
```
export const BTW_SYSTEM_PROMPT_TEMPLATE = readFileSync(
  fileURLToPath(new URL("./prompts/btw-system.md", import.meta.url)),
  "utf-8",
).trimEnd();
```

Then per-call: `systemPrompt = BTW_SYSTEM_PROMPT_TEMPLATE.replace(/\$\{SIDE_QUESTION\}/g, sideQuestion)`. If the file is `.md` with frontmatter, strip via `parseFrontmatter` (publicly exported at `index.d.ts:26`).

**Do NOT declare `pi.prompts` in package.json** — that would expose `/btw-system` as an editor slash-command template, colliding with the `/btw` extension command.

### Model Resolution — `ctx.model`

Primary model exposed at `ctx.model: Model<any> | undefined` (`types.d.ts:192`, backing action `getModel` at `types.d.ts:1003`). Fresh-read each access. `/btw` does NOT persist a model choice; does NOT register a picker; does NOT listen on `model_select` events.

Advisor's full persistent-selection machinery is skipped:
- No `~/.config/rpiv-btw/` directory, no JSON file, no chmod 0600
- No `session_start` handler, no `restoreBtwState`, no `before_agent_start` handler (nothing to strip — no tool registered)
- No `advisor-ui.ts` equivalent for model selection; `btw-ui.ts` exists only for the overlay factory
- No `selectedBtw` module state, no accessors, no effort state

Savings vs advisor: ~200-350 lines of picker/persistence scaffolding. Auth resolution still uses `ctx.modelRegistry.getApiKeyAndHeaders(model)` (same as `advisor.ts:237`).

### Package Layout

```
@juicesharp/rpiv-btw/
├── package.json      # "type":"module", "pi":{"extensions":["./index.ts"]}
├── index.ts          # ~6 LOC: export default (pi) => registerBtwCommand(pi) + message_end hook
├── btw.ts            # constants, prompt load, history state, registerBtwCommand, executeBtw
├── btw-ui.ts         # ctx.ui.custom factory, overlay rendering, keybindings
├── prompts/
│   └── btw-system.md # .md frontmatter optional; contains ${SIDE_QUESTION} placeholder
└── README.md
```

`package.json` essentials:
```json
{
  "name": "@juicesharp/rpiv-btw",
  "version": "0.1.0",
  "type": "module",
  "pi": { "extensions": ["./index.ts"] },
  "files": ["index.ts", "btw.ts", "btw-ui.ts", "prompts/", "README.md"],
  "peerDependencies": {
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-tui": "*"
  }
}
```

Peer-deps vs advisor:
- `@mariozechner/pi-tui` STAYS (overlay uses `Container`/`Text`/`Spacer` from pi-tui; `OverlayOptions` / `OverlayAnchor` types imported via `ctx.ui.custom`'s factory)
- `@sinclair/typebox` DROPPED — `/btw` registers no tool, no `Type.Object({})` schema needed
- Asset allowlist: `files: ["prompts/"]` critical; without it, `readFileSync(new URL("./prompts/...", import.meta.url))` breaks in the installed tarball (competitor-verified advisor fix pattern at `b9428e9`)

## Code References

- `rpiv-advisor/advisor.ts:137-140` — system-prompt module-init load pattern
- `rpiv-advisor/advisor.ts:225-336` — `executeAdvisor` core: auth → branch → serialize → completeSimple → stopReason branches
- `rpiv-advisor/advisor.ts:272-276` — canonical `completeSimple(model, {systemPrompt, messages}, {apiKey, headers, signal, reasoning})` invocation
- `rpiv-advisor/advisor.ts:278-335` — four response branches: `aborted`, `error`, empty text, thrown Error
- `rpiv-advisor/advisor.ts:249-264` — `ctx.sessionManager.getBranch()` → filter(type==="message") → map(e.message) → convertToLlm → (either serialize OR pass raw)
- `rpiv-advisor/advisor.ts:402-488` — `pi.registerCommand("advisor", {handler})` template (only UI-mode guard + picker body differ for /btw)
- `rpiv-advisor/advisor-ui.ts:67-96` — `ctx.ui.custom` overlay factory template (but `/btw` uses a simpler borderless body)
- `rpiv-advisor/index.ts:20-28` — thin default-export extension entry
- `rpiv-advisor/package.json:20-35` — canonical `files` allowlist + peer-deps shape
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:63` — `ctx.ui.notify`
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:65` — `ctx.ui.onTerminalInput(handler)` — DIY abort wiring for Esc
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:93-103` — `ctx.ui.custom<T>(factory, {overlay, overlayOptions, onHandle})`
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:184` — `ctx.hasUI: boolean`
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:192` — `ctx.model: Model<any> | undefined`
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:194` — `ctx.isIdle()`
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:196` — `ctx.signal: AbortSignal | undefined` — bound to MAIN agent, don't forward
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:198` — `ctx.abort()` aborts MAIN agent turn
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:214-243` — `ExtensionCommandContext` (adds waitForIdle/newSession/fork/navigateTree/switchSession/reload)
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:693` — `RegisteredCommand.handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>`
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:734` — `pi.registerCommand(name, options)`
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:749-754` — `pi.registerMessageRenderer`, `pi.sendMessage` (with display/triggerTurn/deliverAs semantics)
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:762-763` — `pi.appendEntry(customType, data)` — persisted, NOT in LLM context
- `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts:1003` — `ExtensionContextActions.getModel: () => Model<any> | undefined`
- `@mariozechner/pi-coding-agent/dist/core/extensions/loader.js:145-151` — `registerCommand` is a pure map insertion; no lifecycle needed
- `@mariozechner/pi-coding-agent/dist/core/extensions/loader.js:224-231` — `jiti.import` with `moduleCache: false` (why module state resets on newSession)
- `@mariozechner/pi-coding-agent/dist/core/agent-session.js:667-705` — `AgentSession.prompt` dispatch entry
- `@mariozechner/pi-coding-agent/dist/core/agent-session.js:672-681` — immediate `/` routing to `_tryExecuteExtensionCommand`
- `@mariozechner/pi-coding-agent/dist/core/agent-session.js:796-821` — `_tryExecuteExtensionCommand`
- `@mariozechner/pi-coding-agent/dist/core/agent-session.js:860-931` — steer/followUp guards; `_throwIfExtensionCommand` rejects queuing at 922-931
- `@mariozechner/pi-coding-agent/dist/core/agent-session.js:944-973` — `sendCustomMessage` branching (triggerTurn, deliverAs, quiet path)
- `@mariozechner/pi-coding-agent/dist/core/agent-session.js:1043-1047` — `abort()` scope: main agent only
- `@mariozechner/pi-coding-agent/dist/core/agent-session.js:1758-1759` — `getSignal: () => this.agent.signal`, `abort: () => this.abort()`
- `@mariozechner/pi-coding-agent/dist/core/agent-session-runtime.js:73-76, 103-126, 127-186` — newSession/fork lifecycle (tear-down + createRuntime rebuild)
- `@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts:23-26` — `SessionMessageEntry`
- `@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts:65-69` — `CustomEntry` — "Does NOT participate in LLM context"
- `@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts:136` — `getSessionId()`
- `@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts:244` — `getBranch(): SessionEntry[]`
- `@mariozechner/pi-coding-agent/dist/core/session-manager.js:678-691` — `appendCustomMessageEntry`
- `@mariozechner/pi-coding-agent/dist/core/session-manager.js:633-644` — `appendCustomEntry`
- `@mariozechner/pi-coding-agent/dist/core/messages.d.ts:32-39` — `CustomMessage` type
- `@mariozechner/pi-coding-agent/dist/core/messages.js:75-122` — `convertToLlm(agentMessages: AgentMessage[]): Message[]`
- `@mariozechner/pi-coding-agent/dist/core/messages.js:89-96` — custom-message case unconditionally emits user-role LLM message (display flag ignored)
- `@mariozechner/pi-coding-agent/dist/core/compaction/utils.js:73-84` — `truncateForSummary(text, 2000)` (advisor pattern only; /btw does not use)
- `@mariozechner/pi-coding-agent/dist/core/compaction/utils.js:93-146` — `serializeConversation` (advisor pattern only)
- `@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js:1741-1900` — TUI `onSubmit` + streaming branch
- `@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js:2225-2233` — `display` flag only gates chat rendering
- `@mariozechner/pi-coding-agent/dist/core/prompt-templates.js:168-248` — editor-side template engine (not for /btw's internal systemPrompt)
- `@mariozechner/pi-ai/dist/stream.d.ts:6-7` — `streamSimple` and `completeSimple` signatures
- `@mariozechner/pi-ai/dist/stream.js:23-26` — `completeSimple(model, context, options) => streamSimple(...).result()`
- `@mariozechner/pi-ai/dist/types.d.ts:116` — `StopReason = "stop" | "length" | "toolUse" | "error" | "aborted"`
- `@mariozechner/pi-ai/dist/types.d.ts:117-143` — `Message` / `UserMessage` / `AssistantMessage` shapes
- `@mariozechner/pi-ai/dist/types.d.ts:150-154` — `Context = { systemPrompt?, messages, tools? }`
- `@mariozechner/pi-ai/dist/types.d.ts:65-69` — `SimpleStreamOptions` (signal, apiKey, headers, reasoning, ...)
- `@mariozechner/pi-ai/dist/providers/anthropic.js:386-465` — each call creates fresh SDK client with freshly-read API key
- `@mariozechner/pi-tui/dist/tui.d.ts:59` — `OverlayAnchor` union including "bottom-center"
- `@mariozechner/pi-tui/dist/tui.d.ts:63-68` — `OverlayMargin`
- `@mariozechner/pi-tui/dist/tui.d.ts:75-102` — `OverlayOptions` full surface
- `@mariozechner/pi-tui/dist/tui.d.ts:106-118` — `OverlayHandle`
- `@tintinweb/pi-subagents/src/index.ts:376-380` — `pi.appendEntry("subagents:record", {...})` persistence pattern (mirror for `btw:sidechain`)
- `@tintinweb/pi-subagents/src/index.ts:413-422` — `globalThis[Symbol.for("pi-subagents:manager")]` programmatic entry (not used by /btw)
- `@tintinweb/pi-subagents/src/agent-runner.ts:254-359` — full subagent spawn: SessionManager.inMemory + createAgentSession + session.prompt (heavyweight; /btw avoids)
- `@tintinweb/pi-subagents/src/context.ts:20-58` — `buildParentContext` — text-serialized prose (drops tool results at line 38)
- `@tintinweb/pi-subagents/src/types.ts:20` — `IsolationMode = "worktree"` (only one value)
- `@tintinweb/pi-subagents/src/types.ts:40` — `inherit_context: boolean`
- `rpiv-pi/extensions/rpiv-core/siblings.ts:22-48` — `SIBLINGS` registry; add `@juicesharp/rpiv-btw` entry here
- `rpiv-pi/extensions/rpiv-core/package-checks.ts:30-33` — `findMissingSiblings` — pure projection over SIBLINGS, no edit needed
- `rpiv-pi/extensions/rpiv-core/setup-command.ts:52, 70-95` — `/rpiv-setup` installer — iterates registry, no edit needed
- `rpiv-pi/package.json:25-32` — `peerDependencies` — add `"@juicesharp/rpiv-btw": "*"` pinned per sibling convention

## Integration Points

### Inbound References

Sibling-registration touchpoints (the ONLY files that need editing in rpiv-pi):

- `rpiv-pi/extensions/rpiv-core/siblings.ts:22-48` — append one entry to the `SIBLINGS` array:
  ```ts
  {
    pkg: "npm:@juicesharp/rpiv-btw",
    matches: /rpiv-btw/i,
    provides: "/btw side-question command",
  },
  ```
- `rpiv-pi/package.json:25-32` — add `"@juicesharp/rpiv-btw": "*"` to `peerDependencies`

No edits to `package-checks.ts`, `setup-command.ts`, `session-hooks.ts`, `constants.ts`, or rpiv-core's `index.ts` — they all consume `SIBLINGS` transitively (confirmed at `siblings.ts:7-9` docs).

### Outbound Dependencies

From `btw.ts`:
- `@mariozechner/pi-ai`: `completeSimple`, `Message`, `AssistantMessage`, `StopReason`, `Api`, `Model`
- `@mariozechner/pi-coding-agent`: `ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext`, `SessionEntry`, `convertToLlm`, `parseFrontmatter` (for prompt `.md`)
- `@mariozechner/pi-tui`: `Container`, `Text`, `Spacer`, `OverlayOptions`, `OverlayAnchor` (for overlay factory)
- Node built-ins: `node:fs` (readFileSync), `node:url` (fileURLToPath), `node:crypto` (randomUUID for sidechain uuid)

### Infrastructure Wiring

- Registration in `index.ts`: `pi.registerCommand("btw", ...)` + `pi.on("message_end", snapshotHandler)` — both invoked inside `export default function(pi: ExtensionAPI)`
- No `pi.registerTool` (not a tool — user-invoked command only)
- No `pi.registerMessageRenderer` (answer is overlay-only, never a `CustomMessage` in the transcript)
- No `pi.on("session_start", ...)` (no state to restore; module re-imports on newSession auto-resets)
- No `pi.on("before_agent_start", ...)` (no tool to strip)

## Architecture Insights

1. **Commands are synchronous dispatch + asynchronous execution**. The TUI submit handler awaits `handler(args, ctx)` while the agent stream runs independently. Long `/btw` calls block the editor (not the agent). This is the correct interpretation of "main agent is NOT interrupted".

2. **Extension module state is a legitimate session-scoped store.** `jiti moduleCache: false` guarantees reset on newSession/fork/reload. Process-level persistence (across newSession) requires either:
   - Disk persistence + `session_start` restore (advisor pattern)
   - `pi.appendEntry` on the parent transcript + replay on `session_start` by reading `getBranch()` filtered by custom type (pi-subagents pattern). This is what `/btw` uses.

3. **`display: false` is NOT a "side channel" primitive.** It's a TUI visibility toggle. The correct side-channel primitives are:
   - `ctx.ui.custom` — transient, ephemeral, never persisted, never in LLM
   - `pi.appendEntry(customType, data)` — persisted in transcript, never in LLM
   - `pi.sendMessage` — persisted AND in LLM context (any combination of display/triggerTurn flags)

4. **`ctx.signal` binding scope is agent-wide.** Extensions running any async work that should be user-cancellable must create their own `AbortController` + wire Esc via `ctx.ui.onTerminalInput`. Documented contract: `ctx.signal` is "the current abort signal, or undefined when the agent is not streaming" (types.d.ts:196).

5. **pi-subagents is orthogonal to side-question patterns.** Its design goal is "spawn a full agent on a narrower task with isolated tools/cwd/worktree". `/btw`'s goal is "single-turn LLM query with primary conversation visibility and zero side-effects on main state". They happen to share `pi.appendEntry` for audit, but the LLM invocation primitive differs: pi-subagents uses `session.prompt` on a fresh `AgentSession`; `/btw` uses `completeSimple` directly.

6. **Prompt-cache parity requires upstream changes.** pi-ai's `streamSimple` → `streamAnthropic` builds cache-breakpoint headers and body itself; no hook exists for extensions to pre-tag breakpoints or re-use prior serialization. Even passing identical `{systemPrompt, messages}` across calls doesn't guarantee byte-identity at the HTTP layer. Future upstream PR: add `{ preserveCacheBreakpoints: true, priorCacheKey?: string }` to `SimpleStreamOptions`.

## Precedents & Lessons

5 commits analyzed across rpiv-pi and rpiv-advisor. Key commits:

- `c388ea9` (rpiv-pi, 2026-04-13) — "Extract tools into @juicesharp Pi plugins; bump to 0.4.0". Deleted 616 LOC `advisor.ts` from rpiv-core; added `package-checks.ts` probe. Blueprint for `/btw` sibling extraction.
- `ce31737` (rpiv-advisor, 2026-04-13) — "Initial commit: extract advisor tool + /advisor command from rpiv-pi". 4 files, 698 LOC. Canonical sibling structure.
- `b9428e9` (rpiv-advisor, 2026-04-15) — "Refactor advisor into constants, UI module, and externalized prompt". Established the `{feature}.ts + {feature}-ui.ts + prompts/{feature}-system.txt` layout and the `files` allowlist + `fileURLToPath` loading pattern. **Assets don't ship unless allowlisted** — hard-won via this refactor.
- `32eaf33` (rpiv-pi, 2026-04-15) — "refactor(rpiv-core): split index into per-concern registrars + SIBLINGS registry". Established `siblings.ts` as the single source of truth for presence detection, missing-plugin warning, and `/rpiv-setup` installer.
- `33825e2` / `bb7e30f` / `be0a014` / `b50fd50` (rpiv-pi pre-extraction) — four follow-up fixes on advisor state/persistence/active-tools-sync/picker-index. **4 of 5 follow-ups were state-management bugs** — by using no persistence, no tool registration, and no picker UI, `/btw` sidesteps this entire bug class.

Composite lessons:
- **State-management is the #1 bug magnet**: advisor's follow-up tail was dominated by persistence + active-tools sync issues. `/btw`'s minimal-state design (module `let btwHistory = []` + `pi.appendEntry` audit) avoids this.
- **Canonical sibling layout is stable**: `index.ts` (thin) + `<feature>.ts` (logic) + `<feature>-ui.ts` (TUI) + `prompts/*` + `constants.ts` for magic strings. Deviating costs a refactor (see `b9428e9`).
- **One entry in `SIBLINGS` = full integration**: detection, missing-plugin warning, and `/rpiv-setup` install all flow from a single registry row (`d271bdd` reinforces: magic strings live in one place, `constants.ts`).
- **`ctx.hasUI` guard before any picker/overlay call**: `advisor.ts:406` pattern. `ctx.ui.custom` throws in non-interactive sessions; gate it.
- **No `/btw`-specific prior art exists** — this is greenfield on top of the advisor blueprint. `thoughts/shared/questions/2026-04-17_21-39-56_btw-extension-requirements.md` is the only pre-existing reference.

## Historical Context (from thoughts/)

- `thoughts/shared/questions/2026-04-17_21-39-56_btw-extension-requirements.md` — research questions artifact (source for this research)
- `thoughts/shared/designs/2026-04-13_17-00-00_extract-rpiv-plugins.md` — extraction design; confirms `session_start` fires for all extensions before any `before_agent_start`; command names are load-bearing
- `thoughts/shared/research/2026-04-16_11-39-33_extract-test-cases-sibling-plugin.md` — sibling plugin patterns; confirms `SIBLINGS` is the only registration surface

## Developer Context

**Q (design intent — screenshot wording): Does "main agent is NOT interrupted — it continues working independently in the background" require the main agent to literally not block?**
A: The main agent's streaming turn runs on an independent `activeRun.promise` (`agent.js:300-322`); it is not paused while `/btw` awaits. The TUI input editor IS blocked by the awaited handler (`interactive-mode.js:1897`), but that's input-editor-level, not agent-level. Wording is accurate.

**Q (`agent-session.js:944-973` + `messages.js:89-96`): Where should `/btw`'s answer land?**
A: `ctx.ui.custom` overlay (bottom-slot, borderless) for ephemeral display + `pi.appendEntry("btw:sidechain", {uuid, q, a, ts})` for audit. NOT `sendMessage({display:false})` (that still leaks into LLM context).

**Q (pi-subagents `isolation:false`): Can `/btw` piggyback on pi-subagents with shared context?**
A: No. `@tintinweb/pi-subagents` has no `isolation:false` flag; `isolation` is a literal type with only `"worktree"` (`types.ts:20`). Closest primitive is `inherit_context: true` (`agent-runner.ts:349-356`), which text-serializes parent branch as prose prepended to the prompt and drops tool results (`context.ts:38`). Also spawns a full agent loop (`agent-runner.ts:254-268`) — overkill for single-shot `/btw`. Build `/btw` as a standalone advisor-style extension.

**Q (developer's observation that side-question history survived a new session): How is this possible if module state resets?**
A: pi-subagents persists via `pi.appendEntry("subagents:record", {...})` on the PARENT session transcript (`@tintinweb/pi-subagents/src/index.ts:376-380`). Survival is because the parent session's JSONL is what pi reloads on resume — not because pi-subagents has its own store. `/btw` adopts the same pattern: `pi.appendEntry("btw:sidechain", {...})` + replay on `session_start` if cross-session continuity is desired.

**Q (advisor truncates tool results at 2000 chars — is this right for `/btw`?)**
A: The 2000-char cap (`compaction/utils.js:73-84`) is a compaction heuristic (cap input to the summarizer model). For `/btw`'s "fork the real conversation" semantics, truncation hides evidence. `/btw` uses raw `convertToLlm(branch)` messages (no serialization), so truncation does not apply. For advisor, this is a separate upstream concern.

**Q (competitor's snapshot semantics): When exactly does the competitor freeze `{systemPrompt, messages}`?**
A: On `stop_reason !== "tool_use"` turns only; snapshot includes `[...messagesForQuery, ...assistantMessages]` (pre-tool-call for the current iteration, includes post-tool-call from all previous iterations). Tool-use turns retain the prior snapshot. Pi mapping: `pi.on("message_end", ...)` gated on `AssistantMessage.stopReason !== "toolUse"`.

**Q (`f` fork key): MVP?**
A: Deferred to post-MVP. MVP keybindings: `↑/↓` scroll, `x` clear history, `Esc` dismiss.

**Q (prompt-cache parity): accept the gap?**
A: Yes for MVP — "best-effort caching". Upstream pi-ai PR would be required for byte-identical prefix reuse. Current `completeSimple` does not expose cache-breakpoint control to extensions.

**Q (overlay anchoring): does `ctx.ui.custom` support bottom-slot?**
A: Yes. `pi-tui/dist/tui.d.ts:75-102` — `OverlayOptions.anchor` includes `"bottom-center"`; `width: "100%"` fills terminal width; `margin: {left:0, right:0, bottom:0}` achieves the edge-to-edge bottom slot from the screenshot. No TUI workaround needed.

## Related Research

- Questions source: `thoughts/shared/questions/2026-04-17_21-39-56_btw-extension-requirements.md`
- Flow documentation (competitor spec): `thoughts/shared/btw-flow-documentation.md`

## Open Questions

None blocking MVP. Post-MVP considerations:

1. **Fork `f` key semantics** — materialize `/btw` Q+A into real custom messages + `ctx.fork()`, or fork directly from the `btw:sidechain` appendEntry record (similar to pi-subagents' record). Decision deferred until MVP ships.

2. **Prompt-cache parity (upstream)** — propose `{ preserveCacheBreakpoints: true }` option on `completeSimple` in pi-ai, or export pi-ai's normalize/cache-breakpoint helpers so extensions can reproduce bytes. Out of scope for this extension; file as separate pi-ai issue.

3. **History cap** — unbounded `btwHistory` grows tokens linearly with call count. If users routinely make >10 `/btw` calls per session, consider capping to last 5 pairs or summarizing older turns. Not MVP-critical.

4. **Advisor's 2000-char truncation** — separate issue for rpiv-advisor; tracked independently of `/btw`.
