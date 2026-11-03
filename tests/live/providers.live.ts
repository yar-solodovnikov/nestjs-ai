/**
 * Live smoke tests against the real provider APIs. They cost a few cents per run.
 *
 *   OPENAI_API_KEY=... ANTHROPIC_API_KEY=... GEMINI_API_KEY=... npm run test:live
 *
 * A provider is skipped when its key is not set. Optional overrides: OPENAI_MODEL,
 * ANTHROPIC_MODEL, GEMINI_MODEL, OLLAMA_MODEL (enables the Ollama suite), OLLAMA_BASE_URL.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  AiService, AiResponseError,
  openaiAdapter, anthropicAdapter, geminiAdapter, ollamaAdapter,
  type IAiAdapter,
} from '../../src'

const env = process.env
const TIMEOUT_MS = 120_000
const CapitalSchema = z.object({ city: z.string(), country: z.string() })

/** The same checks for every provider. */
function smokeSuite(adapter: () => IAiAdapter): void {
  const service = (): AiService => new AiService({ adapter: adapter(), defaultRetryDelay: 2000 })

  it('chat() returns text', async () => {
    const answer = await service().chat('Reply with the single word "pong" and nothing else.')
    expect(answer.toLowerCase()).toContain('pong')
  }, TIMEOUT_MS)

  it('parse() returns data matching the schema', async () => {
    const result = await service().parse({ schema: CapitalSchema, prompt: 'What is the capital of France?' })
    expect(result.city.toLowerCase()).toContain('paris')
    expect(result.country.toLowerCase()).toContain('france')
  }, TIMEOUT_MS)

  it('reports a cut-off answer as AiResponseError "truncated"', async () => {
    const err = await service()
      .chat('Write a 500-word essay about the history of bridges.', { maxTokens: 16 })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AiResponseError)
    expect(err).toMatchObject({ reason: 'truncated', retryable: false })
  }, TIMEOUT_MS)
}

describe.skipIf(!env.OPENAI_API_KEY)('OpenAI (live)', () => {
  smokeSuite(() => openaiAdapter(new OpenAI(), { model: env.OPENAI_MODEL }))
})

describe.skipIf(!env.ANTHROPIC_API_KEY)('Anthropic (live)', () => {
  // With the default model this goes through the beta endpoint with the server-side refusal fallback.
  describe('refusal fallback on', () => {
    smokeSuite(() => anthropicAdapter(new Anthropic(), { model: env.ANTHROPIC_MODEL }))
  })

  describe('refusal fallback off', () => {
    smokeSuite(() => anthropicAdapter(new Anthropic(), { model: env.ANTHROPIC_MODEL, refusalFallback: false }))
  })
})

describe.skipIf(!env.GEMINI_API_KEY)('Gemini (live)', () => {
  describe('@google/genai', () => {
    smokeSuite(() => geminiAdapter(new GoogleGenAI({ apiKey: env.GEMINI_API_KEY! }), { model: env.GEMINI_MODEL }))
  })

  describe('@google/generative-ai (legacy)', () => {
    smokeSuite(() => geminiAdapter(new GoogleGenerativeAI(env.GEMINI_API_KEY!), { model: env.GEMINI_MODEL }))
  })
})

describe.skipIf(!env.OLLAMA_MODEL)('Ollama (live)', () => {
  smokeSuite(() => ollamaAdapter({ model: env.OLLAMA_MODEL, baseUrl: env.OLLAMA_BASE_URL }))
})
