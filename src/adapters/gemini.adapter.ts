import type { IAiAdapter, AdapterCallOptions } from './adapter.interface'
import { AiResponseError } from './response-error'

const DEFAULT_MODEL = 'gemini-3.6-flash'

export interface GeminiAdapterOptions {
  model?: string
  /**
   * Sent only when set. Google recommends keeping Gemini 3 models at the default temperature (1.0):
   * lower values can cause looping or degraded output, so the adapter does not lower it by default.
   */
  temperature?: number
  maxTokens?: number
}

/**
 * Creates an adapter for Google Gemini. Accepts a client from either SDK:
 * - `@google/genai` (recommended): `new GoogleGenAI({ apiKey })`
 * - `@google/generative-ai` (legacy, end of support 2025-08-31): `new GoogleGenerativeAI(apiKey)`
 *
 * @example
 * import { GoogleGenAI } from '@google/genai'
 * geminiAdapter(new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }))
 */
export function geminiAdapter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  client: any,
  defaults: GeminiAdapterOptions = {},
): IAiAdapter {
  const isGenAiClient = typeof client?.models?.generateContent === 'function'
  if (!isGenAiClient && typeof client?.getGenerativeModel !== 'function') {
    throw new TypeError(
      'geminiAdapter expects a GoogleGenAI (@google/genai) or GoogleGenerativeAI (@google/generative-ai) client instance',
    )
  }

  return {
    async complete(prompt: string, options: AdapterCallOptions = {}): Promise<string> {
      const model = options.model ?? defaults.model ?? DEFAULT_MODEL
      const config: Record<string, unknown> = {}
      const temperature = options.temperature ?? defaults.temperature
      const maxOutputTokens = options.maxTokens ?? defaults.maxTokens
      if (temperature !== undefined) config.temperature = temperature
      if (maxOutputTokens !== undefined) config.maxOutputTokens = maxOutputTokens

      const text = isGenAiClient
        ? await completeWithGenAi(client, model, prompt, config)
        : await completeWithLegacySdk(client, model, prompt, config)
      if (!text) throw new Error('Gemini returned an empty response')
      return text
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function completeWithGenAi(client: any, model: string, prompt: string, config: Record<string, unknown>): Promise<string | undefined> {
  const response = await client.models.generateContent({ model, contents: prompt, config })
  assertUsableResponse(response)
  // A getter in @google/genai: joins the text parts of the first candidate, skipping thought parts.
  return response.text
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function completeWithLegacySdk(client: any, model: string, prompt: string, config: Record<string, unknown>): Promise<string | undefined> {
  const generativeModel = client.getGenerativeModel({ model, generationConfig: config })
  const result = await generativeModel.generateContent(prompt)
  // Check before calling text(): it throws an unhelpful error when the answer was blocked.
  assertUsableResponse(result.response)
  return result.response.text()
}

/** Finish reasons that mean a safety/policy filter stopped the answer. */
const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT', 'LANGUAGE',
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertUsableResponse(response: any): void {
  const blockReason: string | undefined = response?.promptFeedback?.blockReason
  if (blockReason) {
    throw new AiResponseError(`Gemini blocked the prompt (${blockReason})`, 'gemini', 'blocked', blockReason)
  }
  const finishReason: string | undefined = response?.candidates?.[0]?.finishReason
  if (finishReason === 'MAX_TOKENS') {
    throw new AiResponseError(
      'Gemini response was cut off by the token limit; increase maxTokens',
      'gemini', 'truncated', finishReason,
    )
  }
  if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
    throw new AiResponseError(`Gemini blocked the response (${finishReason})`, 'gemini', 'blocked', finishReason)
  }
}
