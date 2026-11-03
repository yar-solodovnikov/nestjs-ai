import type { IAiAdapter, AdapterCallOptions } from './adapter.interface'
import { AiResponseError } from './response-error'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_TEMPERATURE = 0

export interface GeminiAdapterOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

/**
 * Creates an adapter for Google Gemini via the @google/generative-ai SDK.
 * Install: npm install @google/generative-ai
 *
 * @example
 * import { GoogleGenerativeAI } from '@google/generative-ai'
 * geminiAdapter(new GoogleGenerativeAI(process.env.GEMINI_API_KEY))
 */
export function geminiAdapter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  client: any,
  defaults: GeminiAdapterOptions = {},
): IAiAdapter {
  return {
    async complete(prompt: string, options: AdapterCallOptions = {}): Promise<string> {
      const model = client.getGenerativeModel({
        model: options.model ?? defaults.model ?? DEFAULT_MODEL,
        generationConfig: {
          temperature: options.temperature ?? defaults.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: options.maxTokens ?? defaults.maxTokens,
        },
      })
      const result = await model.generateContent(prompt)
      // Check before calling text(): it throws an unhelpful error when the answer was blocked.
      assertUsableResponse(result.response)
      const text = result.response.text()
      if (!text) throw new Error('Gemini returned an empty response')
      return text
    },
  }
}

/** Finish reasons that mean a safety/policy filter stopped the answer. */
const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'LANGUAGE',
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
