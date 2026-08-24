# Vercel AI SDK v6 — Verified API Reference

Every API below was verified against the **installed** package source in `node_modules/`.
Nothing here is written from training data. Each entry cites the file it was read from.
Anything that could not be verified is marked **UNVERIFIED**.

Verified on 2026-08-24 against:

| Package | Installed version | Notes |
|---|---|---|
| `ai` | **6.0.265** | resolved from the `ai-v6` dist-tag |
| `@ai-sdk/react` | **3.0.268** | required — `useChat` is NOT in `ai` |
| `@ai-sdk/gateway` | 3.0.180 | transitive dep of `ai`, no explicit install needed |
| `@ai-sdk/provider` | 3.0.15 | transitive |
| `@ai-sdk/provider-utils` | 4.0.47 | transitive |

> **Version warning.** `ai@latest` is now **7.0.78**. v6 is a maintenance line reachable
> only via the `ai-v6` tag. This project is pinned to v6 per the task spec. If the project
> later moves to v7, treat every signature in this document as needing re-verification.

`ai` declares `zod` as a peer at `^3.25.76 || ^4.1.8`; the project's zod 4.4.3 satisfies it.
*Verified: `node_modules/ai/package.json`*

---

## 0. Live Anthropic model list (Vercel AI Gateway)

Fetched live from `https://ai-gateway.vercel.sh/v1/models` (HTTP 200, **no auth required**
to list models). Full Anthropic set, newest first:

| Model id | Context | Max out | $/M in | $/M out |
|---|---|---|---|---|
| `anthropic/claude-sonnet-5` | 1,000,000 | 128,000 | 2.00 | 10.00 |
| `anthropic/claude-sonnet-4.6` | 1,000,000 | 128,000 | 3.00 | 15.00 |
| `anthropic/claude-sonnet-4.5` | 1,000,000 | 64,000 | 3.00 | 15.00 |
| `anthropic/claude-sonnet-4` | 1,000,000 | 8,192 | 3.00 | 15.00 |
| `anthropic/claude-opus-5-fast` | 1,000,000 | 128,000 | 10.00 | 50.00 |
| `anthropic/claude-opus-5` | 1,000,000 | 128,000 | 5.00 | 25.00 |
| `anthropic/claude-opus-4.8-fast` | 1,000,000 | 128,000 | 10.00 | 50.00 |
| `anthropic/claude-opus-4.8` | 1,000,000 | 128,000 | 5.00 | 25.00 |
| `anthropic/claude-opus-4.7` | 1,000,000 | 128,000 | 5.00 | 25.00 |
| `anthropic/claude-opus-4.6` | 1,000,000 | 128,000 | 5.00 | 25.00 |
| `anthropic/claude-opus-4.5` | 200,000 | 64,000 | 5.00 | 25.00 |
| `anthropic/claude-opus-4` | 200,000 | 8,192 | 15.00 | 75.00 |
| `anthropic/claude-haiku-4.5` | 200,000 | 64,000 | 1.00 | 5.00 |
| `anthropic/claude-fable-5` | 1,000,000 | 128,000 | 10.00 | 50.00 |
| `anthropic/claude-3-haiku` | 200,000 | 4,096 | 0.25 | 1.25 |

### Recommendation: `anthropic/claude-sonnet-5`

For a tool-calling conversational agent this is the clear pick, and the pricing table is
the argument:

- It is the **newest Sonnet and also the cheapest Sonnet** — $2/$10 per M tokens versus
  $3/$15 for every older Sonnet. Newer *and* cheaper is a rare combination; there is no
  reason to choose 4.6 or 4.5 over it.
- **1M context / 128k max output.** A catalog agent will hold large tool results (section
  lists, requirement audits) in the conversation. The older `claude-sonnet-4` caps output
  at 8,192 tokens, which is too tight for streaming long answers.
- **Sonnet-tier latency.** This is an interactive chat surface; Opus at 2.5× the price and
  higher latency buys reasoning depth the catalog use case does not need.
- **Prompt caching is cheap** — $0.20/M cache read against $2.00/M fresh input, a 10×
  saving. Worth pinning the system instructions and tool definitions to a cache breakpoint
  once the agent's prompt stabilises.

Secondary choices: `anthropic/claude-haiku-4.5` ($1/$5) for cheap non-conversational
sub-calls such as query classification or reranking; `anthropic/claude-opus-5` only if a
specific task proves Sonnet-5 insufficient.

**UNVERIFIED:** the Gateway `/v1/models` payload carries no tool-calling capability flags,
no benchmark data, and no latency figures. The recommendation above rests on the id,
context, max-output and price fields the endpoint actually returns, plus the general
Sonnet/Opus/Haiku tiering — it is **not** backed by a measured tool-calling eval on this
workload. Benchmark before committing at scale.

---

## 1. Gateway configuration and the `"provider/model"` string

**There is nothing to configure.** A bare string model id resolves through the Vercel AI
Gateway automatically, because the Gateway *is* the default global provider:

```ts
// node_modules/ai/src/model/resolve-model.ts:186-188
function getGlobalProvider(): ProviderV3 {
  return globalThis.AI_SDK_DEFAULT_PROVIDER ?? gateway;
}
```

`resolveLanguageModel()` passes any `typeof model === 'string'` straight to that provider:

```ts
// node_modules/ai/src/model/resolve-model.ts:26-44
export function resolveLanguageModel(model: LanguageModel): LanguageModelV3 {
  if (typeof model !== 'string') { /* ...validate specificationVersion v2|v3... */ }
  return getGlobalProvider().languageModel(model);
}
```

So this is complete and correct with **no provider import and no `@ai-sdk/anthropic`
package**:

```ts
const agent = new ToolLoopAgent({ model: 'anthropic/claude-sonnet-5' });
```

- Default base URL: `https://ai-gateway.vercel.sh/v1/ai`
  *Verified: `node_modules/@ai-sdk/gateway/dist/index.d.ts:915-918` (`GatewayProviderSettings.baseURL` JSDoc)*
- Auth env var: **`AI_GATEWAY_API_KEY`**
  *Verified: `node_modules/@ai-sdk/gateway/dist/index.mjs:88,100,2686* — the error string reads
  ``Provide via 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.``
- On Vercel, OIDC (`@vercel/oidc`) can supply credentials instead of the key.
  **UNVERIFIED** — the package is installed as a dependency and the gateway reads
  `VERCEL_*` env vars (`index.mjs:2508-2520`), but I did not trace the full OIDC auth path.

To override the base URL or key explicitly, or to set a non-Gateway default globally:

```ts
import { createGateway } from '@ai-sdk/gateway';
const myGateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: '...' });
// or set the process-wide default:
globalThis.AI_SDK_DEFAULT_PROVIDER = myGateway;
```
*Verified: `@ai-sdk/gateway/dist/index.d.ts:914-940` (`GatewayProviderSettings`,
`createGatewayProvider as createGateway`); `node_modules/ai/src/global.ts` (the
`AI_SDK_DEFAULT_PROVIDER` global declaration).*

---

## 2. `ToolLoopAgent` — the v6 agent-loop primitive

**It exists under that exact name.** Import from bare `ai`, no subpath.

```ts
import { ToolLoopAgent } from 'ai';
```
*Verified: `node_modules/ai/src/agent/index.ts:16-22`; `node_modules/ai/dist/index.d.ts:6432` (root export list);
`node_modules/ai/docs/07-reference/01-ai-sdk-core/16-tool-loop-agent.mdx:36`*

`Experimental_Agent` and `Experimental_AgentSettings` still resolve but are `@deprecated`
aliases of `ToolLoopAgent` / `ToolLoopAgentSettings`.
*Verified: `node_modules/ai/src/agent/index.ts:11-22`*

Note `Agent` is now an **interface**, not the class — `interface Agent { version: 'agent-v1';
id; tools; generate(); stream() }`.
*Verified: `node_modules/ai/dist/index.d.ts:3434-3456`*

### Constructor options (`ToolLoopAgentSettings`)

`ToolLoopAgentSettings = Omit<CallSettings, 'abortSignal'> & { ... }`.
*Verified: `node_modules/ai/dist/index.d.ts:3257-3378` and `node_modules/ai/src/agent/tool-loop-agent-settings.ts`*

| Option | Type | Note |
|---|---|---|
| `model` | `LanguageModel` | **required** — accepts a bare `"provider/model"` string |
| `instructions` | `string \| SystemModelMessage \| SystemModelMessage[]` | **renamed from `system`** |
| `tools` | `TOOLS extends ToolSet` | `Record<string, Tool>` |
| `toolChoice` | `ToolChoice<TOOLS>` | default `'auto'` |
| `stopWhen` | `StopCondition \| StopCondition[]` | **default `stepCountIs(20)`** |
| `id` | `string` | |
| `allowSystemInMessages` | `boolean` | **default `false`** — system messages inside `messages` are rejected as a prompt-injection risk |
| `activeTools` | `Array<keyof TOOLS>` | subset the model may call this run |
| `output` | `OUTPUT extends Output` | structured output; see caveat below |
| `prepareStep` | `PrepareStepFunction<TOOLS>` | per-step override of model/messages/activeTools/toolChoice |
| `onStepFinish` | `ToolLoopAgentOnStepFinishCallback<TOOLS>` | |
| `onFinish` | `ToolLoopAgentOnFinishCallback<TOOLS>` | |
| `providerOptions` | `ProviderOptions` | |
| `experimental_telemetry` | `TelemetrySettings` | |
| `experimental_repairToolCall` | `ToolCallRepairFunction<TOOLS>` | |
| `experimental_context` | `unknown` | forwarded into tool `execute` options |
| `experimental_download` | `DownloadFunction` | |
| `callOptionsSchema` | `FlexibleSchema<CALL_OPTIONS>` | validated custom per-call options |
| `prepareCall` | `(options) => MaybePromiseLike<...>` | rewrite call params from `CALL_OPTIONS` |

Inherited from `CallSettings` (minus `abortSignal`): `maxOutputTokens`, `temperature`,
`topP`, `topK`, `presencePenalty`, `frequencyPenalty`, `stopSequences`, `seed`,
`maxRetries` (default `2`), `timeout`, `headers`.
`TimeoutConfiguration = number | { totalMs?; stepMs?; chunkMs? }` — `chunkMs` is streaming-only.
*Verified: `node_modules/ai/src/prompt/call-settings.ts`; `node_modules/ai/dist/index.d.ts:3257`*

### Public members

```ts
readonly version: 'agent-v1'
get id(): string | undefined
get tools(): TOOLS
generate(options: AgentCallParameters):   Promise<GenerateTextResult<TOOLS, OUTPUT>>
stream(options:   AgentStreamParameters): Promise<StreamTextResult<TOOLS, OUTPUT>>
```
*Verified: `node_modules/ai/dist/index.d.ts:3469-3491`; `node_modules/ai/src/agent/tool-loop-agent.ts:37-159`*

There is **no** `.run()`, `.call()`, or `.toUIMessageStreamResponse()` on the class.

Call parameters for both methods: `prompt: string | ModelMessage[]` **XOR**
`messages: ModelMessage[]` (mutually exclusive union), plus `abortSignal?`, `timeout?`,
`onStepFinish?`, and `options?` (only when `callOptionsSchema` is set). `stream()` also
accepts `experimental_transform`.
*Verified: `node_modules/ai/dist/index.d.ts:3379-3400`; `node_modules/ai/src/agent/agent.ts:21-81`*

### Usage

```ts
import { ToolLoopAgent, stepCountIs } from 'ai';

const catalogAgent = new ToolLoopAgent({
  model: 'anthropic/claude-sonnet-5',
  instructions: 'You help Columbia students explore the course catalog.',
  tools: { searchCourses, getSection },
  stopWhen: stepCountIs(12), // omit to accept the default of 20
});

// non-streaming
const result = await catalogAgent.generate({ prompt: 'Find me a 4000-level COMS class.' });
console.log(result.text);

// streaming
const stream = await catalogAgent.stream({ prompt: 'Find me a 4000-level COMS class.' });
for await (const chunk of stream.textStream) process.stdout.write(chunk);
```
*Adapted from `node_modules/ai/docs/07-reference/01-ai-sdk-core/16-tool-loop-agent.mdx:12-30`
and `node_modules/ai/docs/03-agents/02-building-agents.mdx:306-314`*

> **Doc bug in the installed copy.** `16-tool-loop-agent.mdx:305-311` writes
> `const stream = agent.stream({...})` with no `await`. That is wrong — `stream()` is
> declared `async` and returns a Promise (`src/agent/tool-loop-agent.ts:159`). **Always await it.**

### Loop control

Three built-in stop conditions, all exported from `ai`:

```ts
// node_modules/ai/src/generate-text/stop-condition.ts
export type StopCondition<TOOLS extends ToolSet> =
  (options: { steps: Array<StepResult<TOOLS>> }) => PromiseLike<boolean> | boolean;

export function stepCountIs(stepCount: number): StopCondition<any>
export function hasToolCall(toolName: string): StopCondition<any>
export function isLoopFinished(): StopCondition<any>   // never fires; run to natural completion
```
*Verified: `node_modules/ai/src/generate-text/stop-condition.ts`; declarations at
`node_modules/ai/dist/index.d.ts:1037-1039`*

Passing an array stops when **any** condition passes:

```ts
stopWhen: [stepCountIs(20), hasToolCall('finalizePlan')]
```
*Verified: `node_modules/ai/docs/03-agents/04-loop-control.mdx:82-94`*

### `output` caveat

`output` expects an `Output` **implementation** from the `Output` namespace
(`Output.object`, `Output.array`, `Output.text`, `Output.choice`, `Output.json`), not a
bare `{ schema }`. `Output` is exported as `output as Output`; the *type* is exported as
`OutputInterface` because the name `Output` is taken by the namespace.
*Verified: `node_modules/ai/dist/index.d.ts:6432` (`output as Output`, `Output as OutputInterface`);
usage at `node_modules/ai/docs/03-agents/02-building-agents.mdx:173`*

> **Doc bug.** `16-tool-loop-agent.mdx:466-474` shows a bare `output: { schema: z.object({...}) }`,
> which does not satisfy the `Output` interface. Use `Output.object({ schema })`.

---

## 3. `InferAgentUIMessage`

**It exists.** Import from bare `ai`.

```ts
export type InferAgentUIMessage<AGENT, MESSAGE_METADATA = unknown> = UIMessage<
  MESSAGE_METADATA,
  never,
  InferUITools<InferAgentTools<AGENT>>
>;
```
*Verified: `node_modules/ai/src/agent/infer-agent-ui-message.ts` (complete file);
exported at `node_modules/ai/src/agent/index.ts:24-30`*

Note the **second type parameter is message metadata**, and the data-parts slot is fixed to
`never` — an agent-inferred UI message type carries no custom data parts.

```ts
// lib/agent/catalog-agent.ts
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';

export const catalogAgent = new ToolLoopAgent({ /* ... */ });
export type CatalogUIMessage = InferAgentUIMessage<typeof catalogAgent>;

// client component — tool parts are now fully typed
const { messages } = useChat<CatalogUIMessage>({ /* ... */ });
```
*Verified: `node_modules/ai/docs/03-agents/02-building-agents.mdx:380-401`*

`Experimental_InferAgentUIMessage` is a deprecated alias.

---

## 4. Defining tools

```ts
import { tool } from 'ai';   // re-exported from @ai-sdk/provider-utils
import { z } from 'zod';

export const searchCourses = tool({
  description: 'Search the Columbia course catalog.',
  inputSchema: z.object({
    subject: z.string().describe('Four-letter subject code, e.g. COMS'),
    level: z.number().optional(),
  }),
  execute: async ({ subject, level }) => {
    // `subject` is inferred as string, `level` as number | undefined
    return searchLocalIndex(subject, level);
  },
});
```
*Verified: `node_modules/ai/docs/07-reference/01-ai-sdk-core/20-tool.mdx:16-33` (usage, import);
`node_modules/ai/dist/index.d.ts:7` (`tool` re-exported from `@ai-sdk/provider-utils`)*

**Zod attaches via `inputSchema`, not `parameters`.** `parameters` was the v4 name and no
longer exists. `inputSchema` accepts a Zod schema or a JSON schema via `jsonSchema()`.

Full option set, all optional except `inputSchema`:
`description`, `title`, `inputSchema`, `outputSchema`, `inputExamples`, `strict`,
`execute`, `toModelOutput`, `needsApproval`, `onInputStart`, `onInputDelta`,
`onInputAvailable`, `providerOptions`, `metadata`, `type`, `id`, `name`, `args`.
*Verified: `node_modules/ai/docs/07-reference/01-ai-sdk-core/20-tool.mdx:36-213`*

Notable:
- `execute: async (input, options: ToolExecutionOptions) => RESULT | AsyncIterable<RESULT>`.
  Returning an async iterable streams preliminary results. **Omitting `execute` entirely**
  makes it a client-side / forced-completion tool and terminates the agent loop.
- `ToolCallOptions` was **renamed to `ToolExecutionOptions`** in v6.
  *Verified: migration guide `24-migration-guide-6-0.mdx:347`*
- `toModelOutput` now receives a **parameter object**: `({ toolCallId, input, output }) => ...`.
  In v5 the argument was the args directly.
  *Verified: `24-migration-guide-6-0.mdx:271-303`*
- `needsApproval: boolean | ((options: { args }) => boolean | Promise<boolean>)` gates
  execution behind a UI approval round-trip — new in v6.
- `name` was **removed** from function tool definitions; the key in the `tools` object is
  the name. *Verified: `24-migration-guide-6-0.mdx:304`*

---

## 5. Streaming from a Next.js App Router route handler

### Preferred: `createAgentUIStreamResponse` (one-liner, agent-aware)

```ts
// app/api/chat/route.ts
import { createAgentUIStreamResponse } from 'ai';
import { catalogAgent } from '@/lib/agent/catalog-agent';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: catalogAgent,
    uiMessages: messages,
  });
}
```
*Verified: `node_modules/ai/docs/07-reference/01-ai-sdk-core/18-create-agent-ui-stream-response.mdx:20-42`;
`node_modules/ai/docs/03-agents/02-building-agents.mdx:321-333`*

The parameter is **`uiMessages`**, not `messages`, and it takes the raw `UIMessage[]` off
the wire — **you do not call `convertToModelMessages` yourself** on this path; the helper
does it internally. Other parameters: `abortSignal`, `timeout`, `options` (for agents with
`CALL_OPTIONS`), `experimental_transform`, plus the usual `UIMessageStreamOptions`.

Siblings exported from `ai`: `createAgentUIStream` (returns the stream), and
`pipeAgentUIStreamToResponse` (Node `ServerResponse`).
*Verified: `node_modules/ai/src/agent/index.ts:31-33`*

### Lower-level: `streamText` + `toUIMessageStreamResponse`

```ts
// app/api/chat/route.ts
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: 'anthropic/claude-sonnet-5',
    messages: await convertToModelMessages(messages),   // NOTE: async in v6
    tools: { searchCourses },
    stopWhen: stepCountIs(5),                            // default is stepCountIs(1)
  });

  return result.toUIMessageStreamResponse();
}
```
*Verified: `node_modules/ai/docs/02-getting-started/02-nextjs-app-router.mdx:94-107, 379-396`*

```ts
// node_modules/ai/dist/index.d.ts:2428
toUIMessageStreamResponse<UI_MESSAGE extends UIMessage>(
  options?: UIMessageStreamResponseInit & UIMessageStreamOptions<UI_MESSAGE>
): Response;
```

Useful options: `onError`, `sendReasoning: true`, `sendSources: true`,
`messageMetadata: ({ part }) => ...` with `originalMessages`.

### `convertToModelMessages` is async in v6

```ts
// node_modules/ai/dist/index.d.ts:3887-3891
declare function convertToModelMessages<UI_MESSAGE extends UIMessage>(
  messages: Array<Omit<UI_MESSAGE, 'id'>>,
  options?: {
    tools?: ToolSet;
    ignoreIncompleteToolCalls?: boolean;
    convertDataPart?: (part: DataUIPart<...>) => TextPart | FilePart | undefined;
  }
): Promise<ModelMessage[]>;
```

Forgetting `await` yields a Promise where a `ModelMessage[]` is expected — TypeScript
catches it, but only if you are not passing through `any`. If a tool defines
`toModelOutput`, pass the **same `tools` object** to both `convertToModelMessages` and
`streamText`, since `toModelOutput` is invoked during conversion.
*Verified: `24-migration-guide-6-0.mdx:250-270`; `20-tool.mdx:141`*

---

## 6. The client hook — `useChat`

**Package: `@ai-sdk/react`. It is NOT exported from `ai`.** The transports are in `ai`,
so a typical client file has two imports.

```ts
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
```
*Verified: `node_modules/@ai-sdk/react/dist/index.d.ts:178` (export list);
`node_modules/ai/dist/index.d.ts:6432` — `useChat` absent;
`node_modules/ai/docs/07-reference/02-ai-sdk-ui/01-use-chat.mdx:23`*

### Signature

```ts
// node_modules/@ai-sdk/react/dist/index.d.ts:39
declare function useChat<UI_MESSAGE extends UIMessage = UIMessage>(
  { experimental_throttle, resume, ...options }?: UseChatOptions<UI_MESSAGE>
): UseChatHelpers<UI_MESSAGE>;
```

The generic is the **message type**, so `useChat<CatalogUIMessage>({...})` gives typed tool parts.

### Options

`UseChatOptions = ({ chat: Chat } | ChatInit) & { experimental_throttle?: number; resume?: boolean }`.
*Verified: `node_modules/@ai-sdk/react/dist/index.d.ts:26-38`; `node_modules/ai/dist/index.d.ts:3745-3789`*

| Option | Type |
|---|---|
| `transport` | `ChatTransport` — defaults to `DefaultChatTransport` on `/api/chat` |
| `messages` | `UIMessage[]` — **initial** messages (replaces v4 `initialMessages`) |
| `id` | `string` |
| `chat` | `Chat<UIMessage>` — if given, all other options are ignored |
| `messageMetadataSchema` | `FlexibleSchema` |
| `dataPartSchemas` | `UIDataTypesToSchemas` |
| `generateId` | `IdGenerator` |
| `onToolCall` | `({ toolCall }) => void \| Promise<void>` |
| `sendAutomaticallyWhen` | `({ messages }) => boolean \| PromiseLike<boolean>` |
| `onFinish` | `({ message, messages, isAbort, isDisconnect, isError, finishReason? }) => void` |
| `onError` | `(error: Error) => void` |
| `onData` | `(dataPart: DataUIPart) => void` |
| `experimental_throttle` | `number` (React only) |
| `resume` | `boolean` |

**Gone:** `api`, `initialInput`, `initialMessages`, `body`, `headers`, `credentials`,
`sendExtraMessageFields`, `maxSteps`, `onResponse`. HTTP config moved onto the transport.

### Returns — the complete surface

```ts
// node_modules/@ai-sdk/react/dist/index.d.ts:13-25
type UseChatHelpers<UI_MESSAGE extends UIMessage> = {
    readonly id: string;
    setMessages: (messages: UI_MESSAGE[] | ((messages: UI_MESSAGE[]) => UI_MESSAGE[])) => void;
    error: Error | undefined;
} & Pick<AbstractChat<UI_MESSAGE>,
    'sendMessage' | 'regenerate' | 'stop' | 'resumeStream' | 'addToolResult'
  | 'addToolOutput' | 'addToolApprovalResponse' | 'status' | 'messages' | 'clearError'>;
```

That is everything: `id, messages, setMessages, status, error, clearError, sendMessage,
regenerate, stop, resumeStream, addToolOutput, addToolApprovalResponse, addToolResult` (deprecated).

### `input` / `handleInputChange` / `handleSubmit` no longer exist

The hook no longer manages input state. You own it.

```tsx
'use client';
import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });
  const [input, setInput] = useState('');

  return (
    <form onSubmit={e => {
      e.preventDefault();
      if (input.trim()) { sendMessage({ text: input }); setInput(''); }
    }}>
      <input value={input} onChange={e => setInput(e.target.value)}
             disabled={status !== 'ready'} />
    </form>
  );
}
```
*Verified: `node_modules/ai/docs/04-ai-sdk-ui/02-chatbot.mdx:29-69`; the removal is stated
outright at `node_modules/ai/docs/07-reference/02-ai-sdk-ui/01-use-chat.mdx:10-16`*

`sendMessage({ text })` replaces `append`/`handleSubmit`; `regenerate({ messageId? })`
replaces `reload`. Calling `sendMessage()` with **no argument** resubmits current messages.
Per-request overrides go in the second argument: `sendMessage({ text }, { headers, body, metadata })`.
*Verified: `node_modules/ai/dist/index.d.ts:3826-3846`; `02-chatbot.mdx:428-445`*

### `status` replaces `isLoading`

```ts
type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';
```
*Verified: `node_modules/ai/dist/index.d.ts:3711`*

"Busy" is `status === 'submitted' || status === 'streaming'`. There is no `isLoading` on
`useChat` (it survives only on `useCompletion`).

---

## 7. Conversation history and the message type

### What goes over the wire

`DefaultChatTransport` POSTs JSON to `api` (default `/api/chat`) with:

```js
// node_modules/ai/dist/index.mjs:13767-13774
{ id: chatId, messages: options.messages, trigger, messageId, ...yourBody }
```

The server therefore receives the **full `UIMessage[]` including `parts`** — not
`ModelMessage[]`. `trigger` is `'submit-message' | 'regenerate-message'`.

> **Doc bug.** `02-chatbot.mdx:615-635` shows `'submit-user-message'` /
> `'regenerate-assistant-message'`. The runtime emits `'submit-message'` /
> `'regenerate-message'` (`ai/dist/index.mjs:13889, 13935, 13958`). Trust the runtime.

To trim history, use `prepareSendMessagesRequest` on the transport:

```ts
new DefaultChatTransport({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
    body: { messages: messages.slice(-10), trigger, messageId },
  }),
})
```
*Verified: `node_modules/ai/docs/04-ai-sdk-ui/21-transport.mdx:83-96`*

### `UIMessage`

```ts
// node_modules/ai/dist/index.d.ts:1589-1613
interface UIMessage<METADATA = unknown, DATA_PARTS extends UIDataTypes = UIDataTypes,
                    TOOLS extends UITools = UITools> {
  id: string;
  role: 'system' | 'user' | 'assistant';
  metadata?: METADATA;
  parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>;
}
```

**There is no `content` field.** Render `parts` only.

```ts
// node_modules/ai/dist/index.d.ts:1614
type UIMessagePart<DATA_TYPES, TOOLS> =
  | TextUIPart | ReasoningUIPart | ToolUIPart<TOOLS> | DynamicToolUIPart
  | SourceUrlUIPart | SourceDocumentUIPart | FileUIPart
  | DataUIPart<DATA_TYPES> | StepStartUIPart;
```

- `{ type: 'text'; text: string; state?: 'streaming' | 'done'; providerMetadata? }`
- `{ type: 'reasoning'; id?; text: string; state?: 'streaming' | 'done'; providerMetadata? }`
- `{ type: 'source-url'; sourceId; url; title?; providerMetadata? }`
- `{ type: 'source-document'; sourceId; mediaType; title; filename?; providerMetadata? }`
- `{ type: 'file'; mediaType; filename?; url }`
- `{ type: 'data-${NAME}'; id?; data }`
- `{ type: 'step-start' }`
- `` `tool-${NAME}` `` and `'dynamic-tool'` — see below.

Two message types coexist: `UIMessage` (client/wire, has `parts`) and `ModelMessage`
(provider-facing, produced by `convertToModelMessages`). `CoreMessage` was **removed** in v6.
*Verified: `24-migration-guide-6-0.mdx:130`*

---

## 8. Reading tool calls and results out of the stream (for rendering cards)

### Part type string

```ts
// node_modules/ai/dist/index.d.ts:1814-1818
type ToolUIPart<TOOLS extends UITools = UITools> = ValueOf<{
    [NAME in keyof TOOLS & string]: { type: `tool-${NAME}` } & UIToolInvocation<TOOLS[NAME]>;
}>;
```

A tool registered under key `searchCourses` produces `part.type === 'tool-searchCourses'`.
*Also stated at `node_modules/ai/docs/02-getting-started/02-nextjs-app-router.mdx:307-311`*

Common fields on every variant: `toolCallId: string`, `title?: string`,
`toolMetadata?: JSONObject`, `providerExecuted?: boolean`.

### The `state` machine — seven values

*Verified: `node_modules/ai/dist/index.d.ts:1724-1813` (`UIToolInvocation`)*

| `state` | payload |
|---|---|
| `'input-streaming'` | `input?` (partial) |
| `'input-available'` | `input` |
| `'approval-requested'` | `input`, `approval: { id; signature? }` |
| `'approval-responded'` | `input`, `approval: { id; approved: boolean; reason? }` |
| `'output-available'` | `input`, **`output`**, `preliminary?: boolean`, `resultProviderMetadata?` |
| `'output-error'` | `input \| undefined`, `rawInput?`, **`errorText: string`** |
| `'output-denied'` | `input`, `approval: { id; approved: false; reason? }` |

The three approval states are **new in v6** — exhaustive `switch` statements must cover them.

> **Doc bug.** `node_modules/ai/docs/07-reference/01-ai-sdk-core/31-ui-message.mdx:133-168`
> lists only four states and omits `toolMetadata`/`title`/`rawInput`/`preliminary`. It is
> stale. Trust `dist/index.d.ts`.

### Rendering pattern

```tsx
{messages.map(message => (
  <div key={message.id}>
    {message.parts.map((part, i) => {
      switch (part.type) {
        case 'text':
          return <p key={i}>{part.text}</p>;

        case 'tool-searchCourses': {
          const callId = part.toolCallId;
          switch (part.state) {
            case 'input-streaming':    return <Skeleton key={callId} />;
            case 'input-available':    return <div key={callId}>Searching {part.input.subject}…</div>;
            case 'approval-requested': return <ApprovalPrompt key={callId} id={part.approval.id} />;
            case 'approval-responded': return <div key={callId}>Approval recorded.</div>;
            case 'output-available':   return <CourseResultCard key={callId} results={part.output} />;
            case 'output-error':       return <ErrorCard key={callId} message={part.errorText} />;
            case 'output-denied':      return <div key={callId}>Search denied.</div>;
          }
          break;
        }
      }
    })}
  </div>
))}
```
*Adapted from `node_modules/ai/docs/04-ai-sdk-ui/03-chatbot-tool-usage.mdx:263-299`*

With `useChat<CatalogUIMessage>()`, `part.input` and `part.output` are fully typed from the
tool's zod schemas — this is the payoff of `InferAgentUIMessage`.

### Helper functions were renamed in v6

| v5 | v6 |
|---|---|
| `isToolUIPart` | **`isStaticToolUIPart`** |
| `isToolOrDynamicToolUIPart` | **`isToolUIPart`** |
| `getToolName` | **`getStaticToolName`** |
| `getToolOrDynamicToolName` | **`getToolName`** |

The old names still resolve but are deprecated. This rename is a silent-behaviour-change
trap: `isToolUIPart` and `getToolName` still exist but now mean something **broader** than
they did in v5.
*Verified: `24-migration-guide-6-0.mdx:556-639`*

### Dynamic tools

Runtime-defined tools (MCP) use a single `{ type: 'dynamic-tool'; toolName: string; ... }`
part instead of a typed name. In `onToolCall`, narrow with `if (toolCall.dynamic) return;`.
*Verified: `03-chatbot-tool-usage.mdx:109-114, 502-533`; `ai/dist/index.d.ts:1819-1834`*

There is **no `toolInvocations` array** and no `part.type === 'tool-invocation'`. The v4
shape is gone entirely.

### Sending tool results from the client

```ts
addToolOutput({ tool: 'getLocation', toolCallId, output });                    // -> 'output-available'
addToolOutput({ tool: 'getLocation', toolCallId, state: 'output-error', errorText });
addToolApprovalResponse({ id: part.approval.id, approved: true });
```
*Verified: `node_modules/ai/dist/index.d.ts:3689-3710`; `03-chatbot-tool-usage.mdx:446-450`*

Call `addToolOutput` **without `await`** to avoid deadlocks (`03-chatbot-tool-usage.mdx:107,156`).
`addToolResult` is deprecated; its `{ toolCallId, result }` shape is replaced by
`{ tool, toolCallId, output }` — the `tool` name is now required for type safety.

To auto-resubmit once all client tool calls are answered:

```ts
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
useChat({ sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls });
```
*Verified: `node_modules/ai/dist/index.d.ts:4062-4064`. The approval-aware variant is
`lastAssistantMessageIsCompleteWithApprovalResponses`.*

### `DirectChatTransport` — skip HTTP entirely

```ts
// node_modules/ai/dist/index.d.ts:4005-4038
new DirectChatTransport({ agent, options?, ...uiMessageStreamOptions })
```

Runs an `Agent` in-process with no route handler. Useful for local prototyping;
**not** appropriate for the real app, since it would put tool execution and the model key
in the browser.
*Verified: `node_modules/ai/dist/index.d.ts:4005-4039`; `21-transport.mdx:99-125`*

---

## 9. Typecheck result

`npx tsc --noEmit` after both installs: **no error is attributable to the install.**

The error set churned between two runs minutes apart, which is itself evidence that other
agents are editing concurrently.

First run — 3 errors, missing local helpers in a file showing as modified-uncommitted:

```
components/instructor/courses-taught.tsx(30,44):  error TS2304: Cannot find name 'readSeats'.
components/instructor/courses-taught.tsx(99,31):  error TS2304: Cannot find name 'readSeats'.
components/instructor/courses-taught.tsx(100,30): error TS2304: Cannot find name 'provenanceLabel'.
```

Second run — those were fixed by another agent, and 2 different ones appeared, a React
component prop mismatch:

```
app/course/[courseId]/course-detail.tsx(235,39):   error TS2322: Property 'avatarInitials'
  does not exist on type 'IntrinsicAttributes & CourseHeroCardProps'.
app/course/[courseId]/section-detail.tsx(441,39):  error TS2322: Property 'avatarInitials'
  does not exist on type 'IntrinsicAttributes & CourseHeroCardProps'.
```

Confirmed unrelated to the dependency change: a repo-wide grep for `from 'ai'` and
`@ai-sdk` across `app/ lib/ components/ scripts/` returns **zero** matches. No application
code imports the SDK yet, so the install cannot be implicated in any of these. The install
itself reported 0 vulnerabilities and no peer-dependency conflicts.

---

## 10. Summary of things a model would get wrong from training data

1. `system:` → **`instructions:`** on the agent constructor, and `maxSteps` → **`stopWhen: stepCountIs(n)`** (default 20 on `ToolLoopAgent`, 1 on `streamText`).
2. `useChat` is in **`@ai-sdk/react`**, not `ai`, and no longer manages input — `input`, `handleInputChange`, `handleSubmit`, `isLoading`, `append`, `reload`, `api`, `initialMessages` are all gone.
3. Tool schemas attach via **`inputSchema`**, not `parameters`.
4. **`convertToModelMessages` is async** and returns `Promise<ModelMessage[]>`.
5. `message.content` does not exist; render **`message.parts`**, where tool parts are typed `` `tool-${name}` `` with a **seven-value** `state` union.
