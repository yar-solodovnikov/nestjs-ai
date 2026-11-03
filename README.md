# nestjs-ai

[![npm version](https://img.shields.io/npm/v/nestjs-ai)](https://www.npmjs.com/package/nestjs-ai)
[![npm downloads](https://img.shields.io/npm/dm/nestjs-ai)](https://www.npmjs.com/package/nestjs-ai)
[![license](https://img.shields.io/github/license/yar-solodovnikov/nestjs-ai)](LICENSE)
[![CI](https://github.com/yar-solodovnikov/nestjs-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/yar-solodovnikov/nestjs-ai/actions/workflows/ci.yml)

The first-class NestJS module for AI providers — **OpenAI, Anthropic, Gemini, Ollama**.

Injectable `AiService` with Zod-validated structured output, smart retry with error feedback, and zero vendor lock-in.

```ts
@Injectable()
export class ProductService {
  constructor(@InjectAi() private ai: AiService) {}

  async extract(text: string) {
    return this.ai.parse({
      schema: z.object({ name: z.string(), price: z.number(), inStock: z.boolean() }),
      prompt: `Extract product info: ${text}`,
    })
    // { name: string, price: number, inStock: boolean } — guaranteed
  }
}
```

---

## Why nestjs-ai?

Every NestJS developer who integrates AI ends up writing the same boilerplate: wrap the client, handle JSON parsing failures, add retry logic, wire it into DI. `nestjs-ai` does all of this once, correctly.

| Feature | nestjs-ai | Writing it yourself |
|---|---|---|
| Injectable AI service | yes | manual wiring |
| Zod structured output | yes | manual parsing |
| Smart retry with error context | yes | manual retry loops |
| JSON auto-repair | yes | manual handling |
| OpenAI + Anthropic + Gemini + Ollama | yes | separate integrations |
| Multiple named instances | yes | complex DI setup |

---

## Installation

```bash
npm install nestjs-ai
```

Install the provider SDK you need (all optional peer dependencies):

```bash
# OpenAI / Ollama
npm install openai

# Anthropic
npm install @anthropic-ai/sdk

# Gemini (free tier available)
npm install @google/genai
```

For structured output:

```bash
npm install zod
```

---

## Quick Start

### 1. Register the module

```ts
// app.module.ts
import { Module } from '@nestjs/common'
import { AiModule, openaiAdapter } from 'nestjs-ai'
import OpenAI from 'openai'

@Module({
  imports: [
    AiModule.forRoot({
      adapter: openaiAdapter(new OpenAI({ apiKey: process.env.OPENAI_API_KEY })),
      defaultRetries: 3,
    }),
  ],
})
export class AppModule {}
```

### 2. Inject and use

```ts
// chat.service.ts
import { Injectable } from '@nestjs/common'
import { InjectAi, AiService } from 'nestjs-ai'
import { z } from 'zod'

@Injectable()
export class ChatService {
  constructor(@InjectAi() private ai: AiService) {}

  async ask(question: string): Promise<string> {
    return this.ai.chat(question)
  }

  async extractUser(text: string) {
    return this.ai.parse({
      schema: z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().email(),
      }),
      prompt: `Extract user info from: ${text}`,
    })
  }
}
```

---

## Providers

### OpenAI

```ts
import { openaiAdapter } from 'nestjs-ai'
import OpenAI from 'openai'

AiModule.forRoot({
  adapter: openaiAdapter(new OpenAI(), { model: 'gpt-6-luna' }),
})
```

### Anthropic

```ts
import { anthropicAdapter } from 'nestjs-ai'
import Anthropic from '@anthropic-ai/sdk'

AiModule.forRoot({
  adapter: anthropicAdapter(new Anthropic(), { model: 'claude-opus-5-5' }),
})
```

### Gemini (free tier available)

```ts
import { geminiAdapter } from 'nestjs-ai'
import { GoogleGenAI } from '@google/genai'

AiModule.forRoot({
  adapter: geminiAdapter(new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })),
})
```

A legacy `@google/generative-ai` client (`new GoogleGenerativeAI(apiKey)`) still works, but that SDK
reached end of support on 2025-08-31; prefer `@google/genai`.

### Ollama (local models)

```ts
import { ollamaAdapter } from 'nestjs-ai'

AiModule.forRoot({
  adapter: ollamaAdapter({ model: 'llama3.2', baseUrl: 'http://localhost:11434/v1' }),
  defaultRetries: 5,
})
```

---

## Async configuration (with ConfigService)

```ts
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AiModule, openaiAdapter } from 'nestjs-ai'
import OpenAI from 'openai'

@Module({
  imports: [
    ConfigModule.forRoot(),
    AiModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        adapter: openaiAdapter(new OpenAI({ apiKey: config.get('OPENAI_API_KEY') })),
        defaultRetries: config.get('AI_RETRIES', 3),
      }),
    }),
  ],
})
export class AppModule {}
```

---

## Multiple named instances

Use different providers or models in the same application:

```ts
@Module({
  imports: [
    AiModule.register('fast', {
      adapter: openaiAdapter(new OpenAI(), { model: 'gpt-4.1-mini' }),
    }),
    AiModule.register('smart', {
      adapter: openaiAdapter(new OpenAI(), { model: 'gpt-6-luna' }),
    }),
  ],
})
export class AppModule {}
```

```ts
@Injectable()
export class AnalysisService {
  constructor(
    @InjectAi('fast') private fast: AiService,
    @InjectAi('smart') private smart: AiService,
  ) {}

  async classify(text: string) {
    return this.fast.chat(`Classify as spam or not: ${text}`)
  }

  async analyze(text: string) {
    return this.smart.parse({ schema: ReportSchema, prompt: text })
  }
}
```

---

## How structured output works

```
Your prompt
      |
1. Zod schema converted to a text hint and appended to prompt
      |
2. LLM responds (may return markdown, broken JSON, wrong types)
      |
3. Strip markdown, extract JSON block
      |
4. Auto-repair malformed JSON (trailing commas, unquoted keys...)
      |
5. Validate against Zod schema
      |
  Valid  -> return typed result
  Invalid -> send exact Zod error back to LLM -> retry
```

Smart retry example:

```
Attempt 1: LLM returns { "age": "twenty five" }
Zod error:  "age: Expected number, received string"
Attempt 2: LLM receives the error -> returns { "age": 25 }
```

Works with both zod v3 and zod v4 schemas.

### Error handling

When all attempts fail, `parse()` throws an `AiError`:

```ts
import { AiError } from 'nestjs-ai'

try {
  await this.ai.parse({ schema, prompt })
} catch (err) {
  if (err instanceof AiError) {
    err.attempts      // attempts actually made
    err.lastRaw       // last raw LLM response ('' if the provider never answered)
    err.lastZodError  // validation error for lastRaw, if any
    err.cause         // the underlying error of the last attempt (e.g. the SDK's APIError)
  }
}
```

Provider errors with a 4xx status (invalid API key, unknown model, bad request) are not retried,
since they fail the same way every time. Rate limits (429), timeouts (408), conflicts (409),
server errors and network errors are retried. The OpenAI and Anthropic SDKs also retry
rate limits with backoff on their own before the error reaches `nestjs-ai`.

When the provider answers but the answer can't be used, the adapter throws an `AiResponseError`
(available as `AiError.cause`), which is not retried because the same request fails the same way:

| `reason` | When |
|---|---|
| `truncated` | The output token limit was hit (`max_tokens` / `length` / `MAX_TOKENS`). Increase `maxTokens`. |
| `refusal` | The model declined the request. `detail` holds the refusal category or text. |
| `blocked` | A content/safety filter blocked the prompt or the answer. `detail` holds the provider's reason. |

Truncated answers are never passed on, so a cut-off JSON is not "repaired" into partial data.
The parser follows the same rule for any adapter: a JSON value that is opened but never closed is
treated as unparseable (and retried) instead of being completed or replaced by a nested fragment.

---

## Logging

```ts
import { consoleAiLogger } from 'nestjs-ai'

AiModule.forRoot({
  adapter: openaiAdapter(new OpenAI()),
  logger: consoleAiLogger,
  // [nestjs-ai] attempt 1 -- prompt: Extract user info...
  // [nestjs-ai] attempt 1 succeeded in 843ms
})
```

Custom logger:

```ts
import type { AiLogger } from 'nestjs-ai'

const myLogger: AiLogger = {
  onRequest({ attempt, prompt }) {
    logger.debug(`AI attempt ${attempt}`, { prompt })
  },
  onResponse({ durationMs, success }) {
    metrics.record('ai.request', { durationMs, success })
  },
  onRetry(attempt, error) {
    logger.warn(`AI retry ${attempt}: ${error.message}`)
  },
}
```

---

## Bring your own adapter

```ts
import type { IAiAdapter } from 'nestjs-ai'

const myAdapter: IAiAdapter = {
  async complete(prompt, options) {
    // call any AI API here
    return responseText
  },
}

AiModule.forRoot({ adapter: myAdapter })
```

---

## API Reference

### `AiModule`

| Method | Description |
|---|---|
| `forRoot(options)` | Register default instance |
| `forRootAsync(options)` | Register with factory (ConfigService etc.) |
| `register(name, options)` | Register a named instance |
| `registerAsync(name, options)` | Register a named instance with factory |

### `AiService`

| Method | Description |
|---|---|
| `chat(prompt, options?)` | Plain completion, returns `string` |
| `parse({ schema, prompt, ...options })` | Structured output, returns `z.infer<typeof schema>` |

### `AiModuleOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `adapter` | `IAiAdapter` | required | Provider adapter |
| `defaultRetries` | `number` | `3` | Default total number of attempts for `parse()` (integer >= 1) |
| `defaultModel` | `string` | adapter default | Default model |
| `defaultTemperature` | `number` | adapter default | Default temperature |
| `defaultMaxTokens` | `number` | adapter default | Default max tokens |
| `isGlobal` | `boolean` | `false` | Register module globally (no need to import in each feature module) |
| `logger` | `AiLogger` | none | Request/response/retry logger |

### `ParseOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `schema` | `ZodTypeAny` | required | Zod schema for validation |
| `prompt` | `string` | required | Prompt text |
| `retries` | `number` | `defaultRetries` | Override the total number of attempts (integer >= 1) |
| `model` | `string` | `defaultModel` | Override model for this call |
| `temperature` | `number` | `defaultTemperature` | Override temperature |
| `maxTokens` | `number` | `defaultMaxTokens` | Override max tokens for this call |
| `onRetry` | `(attempt, error) => void` | none | Called before each retry |

### Adapters

| Function | Package | Default model |
|---|---|---|
| `openaiAdapter(client, opts?)` | `openai` | `gpt-6-luna` |
| `anthropicAdapter(client, opts?)` | `@anthropic-ai/sdk` | `claude-opus-5-5` |
| `geminiAdapter(client, opts?)` | `@google/genai` (or legacy `@google/generative-ai`) | `gemini-3.6-flash` |
| `ollamaAdapter(opts?)` | `openai` (via baseURL) | `llama3.2` |

All adapters accept `{ model?, temperature?, maxTokens? }` defaults (`ollamaAdapter` also takes `baseUrl`).
Per-call options and `AiModuleOptions` defaults take precedence over adapter defaults.

Provider notes:

- **OpenAI.** For reasoning models (`o1`, `o3`, `o4-mini`, `gpt-5` and later, including the default
  `gpt-6-luna`), `openaiAdapter` sends `max_completion_tokens` instead of `max_tokens` and omits the
  default temperature, which these models reject. Other models get `temperature: 0` unless set.
  A leading `<think>…</think>` block (thinking models on Ollama/vLLM) is stripped from the answer.
- **Anthropic.** `temperature` is never sent: Claude 4.7+ models accept only the default sampling
  settings, and `@anthropic-ai/sdk` >= 1.0.0 (API version `2026-10-21`) rejects it on every model.
  The `temperature` option is deprecated and ignored. `max_tokens` defaults to 16000, since current
  models think by default and thinking counts toward the limit. For `claude-fable-5-1`,
  `claude-opus-5-5`, `claude-opus-5` and `claude-sonnet-5-5` the adapter enables Anthropic's
  server-side refusal fallback (`fallbacks: "default"`), so a declined request is re-run on a
  fallback model in the same call. It is skipped for Bedrock, Vertex and Foundry clients; turn it off
  with `anthropicAdapter(client, { refusalFallback: false })`.
- **Gemini.** `temperature` is sent only when set: Google recommends keeping Gemini 3 models at the
  default temperature, as lower values can cause looping. `geminiAdapter` detects the SDK from the
  client: `GoogleGenAI` (`@google/genai`) or the legacy `GoogleGenerativeAI` (`@google/generative-ai`).

---

## Migrating from 1.x

2.0 keeps the public API (imports, options, signatures), but changes runtime behavior:

**Errors that were not thrown before**

- Adapters throw `AiResponseError` when the answer was truncated by the token limit, refused, or
  blocked by a content filter. `chat()` used to return the partial or empty text in these cases and
  now throws; `parse()` fails right away instead of retrying (see [Error handling](#error-handling)).
- `parse()` no longer completes a JSON value that was cut off (`{"name":"John","tags":["a"`); the
  attempt fails and is retried. Malformed but complete JSON is still repaired.
- Provider errors with a 4xx status other than 408, 409 and 429 are no longer retried.
- `retries` must be an integer >= 1; other values throw a `RangeError`.
- `geminiAdapter` throws a `TypeError` when created with something that is not a Gemini client
  instance (for example the class itself), instead of failing on the first request.

**New defaults** (only matter if you do not set them yourself)

| Adapter | 1.x | 2.0 |
|---|---|---|
| `openaiAdapter` model | `gpt-4o-mini` | `gpt-6-luna` |
| `anthropicAdapter` model | `claude-haiku-4-5-20251001` | `claude-opus-5-5` |
| `anthropicAdapter` `max_tokens` | 1024 | 16000 |
| `geminiAdapter` model | `gemini-2.0-flash` (shut down) | `gemini-3.6-flash` |
| Temperature | 0 | OpenAI non-reasoning models: 0. Reasoning models and Gemini: provider default. Anthropic: never sent. |

The new default models cost more per token than the 1.x ones. To keep costs and behavior
predictable, set `model` (and `maxTokens`) explicitly.

**Other changes**

- `anthropicAdapter` ignores `temperature` and enables the server-side refusal fallback on
  supported models; pass `refusalFallback: false` to turn it off.
- `geminiAdapter` accepts a `GoogleGenAI` client from `@google/genai`. The legacy
  `@google/generative-ai` client keeps working.
- CommonJS consumers get their own type declarations (`index.d.cts`).

---

## License

MIT
