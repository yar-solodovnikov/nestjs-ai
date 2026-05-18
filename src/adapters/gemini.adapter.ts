import type { IAiAdapter, AdapterCallOptions } from './adapter.interface'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_TEMPERATURE = 0

export interface GeminiAdapterOptions {
  model?: string
  temperature?: number
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  defaults: GeminiAdapterOptions = {},
): IAiAdapter {
  return {
    async complete(prompt: string, options: AdapterCallOptions = {}): Promise<string> {
      const model = client.getGenerativeModel({
        model: options.model ?? defaults.model ?? DEFAULT_MODEL,
        generationConfig: {
          temperature: options.temperature ?? defaults.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: options.maxTokens,
        },
      })
      const result = await model.generateContent(prompt)
      const text = result.response.text()
      if (!text) throw new Error('Gemini returned an empty response')
      return text
    },
  }
}
