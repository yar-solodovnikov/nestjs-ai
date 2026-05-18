# nestjs-ai

[![npm version](https://img.shields.io/npm/v/nestjs-ai.svg)](https://www.npmjs.com/package/nestjs-ai)
[![npm downloads](https://img.shields.io/npm/dm/nestjs-ai.svg)](https://www.npmjs.com/package/nestjs-ai)
[![license](https://img.shields.io/npm/l/nestjs-ai.svg)](LICENSE)

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
npm install @google/generative-ai
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
  adapter: openaiAdapter(new OpenAI(), { model: 'gpt-4o-mini' }),
})
```

### Anthropic

```ts
import { anthropicAdapter } from 'nestjs-ai'
import Anthropic from '@anthropic-ai/sdk'

AiModule.forRoot({
  adapter: anthropicAdapter(new Anthropic(), { model: 'claude-haiku-4-5-20251001' }),
})
```

### Gemini (free tier available)

```ts
import { geminiAdapter } from 'nestjs-ai'
import { GoogleGenerativeAI } from '@google/generative-ai'

AiModule.forRoot({
  adapter: geminiAdapter(new GoogleGenerativeAI(process.env.GEMINI_API_KEY)),
})
```

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
      adapter: openaiAdapter(new OpenAI(), { model: 'gpt-4o-mini' }),
    }),
    AiModule.register('smart', {
      adapter: openaiAdapter(new OpenAI(), { model: 'gpt-4o' }),
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
| `defaultRetries` | `number` | `3` | Default retry count for `parse()` |
| `defaultModel` | `string` | adapter default | Default model |
| `defaultTemperature` | `number` | adapter default | Default temperature |
| `logger` | `AiLogger` | none | Request/response/retry logger |

### `ParseOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `schema` | `ZodTypeAny` | required | Zod schema for validation |
| `prompt` | `string` | required | Prompt text |
| `retries` | `number` | `defaultRetries` | Override retry count |
| `model` | `string` | `defaultModel` | Override model for this call |
| `temperature` | `number` | `defaultTemperature` | Override temperature |
| `onRetry` | `(attempt, error) => void` | none | Called before each retry |

### Adapters

| Function | Package | Default model |
|---|---|---|
| `openaiAdapter(client, opts?)` | `openai` | `gpt-4o-mini` |
| `anthropicAdapter(client, opts?)` | `@anthropic-ai/sdk` | `claude-haiku-4-5-20251001` |
| `geminiAdapter(client, opts?)` | `@google/generative-ai` | `gemini-2.0-flash` |
| `ollamaAdapter(opts?)` | `openai` (via baseURL) | `llama3.2` |

---

## License

MIT