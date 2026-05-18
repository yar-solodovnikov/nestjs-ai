import type { IAiAdapter, AdapterCallOptions } from './adapter.interface'

const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TEMPERATURE = 0

export interface OpenAiAdapterOptions {
  model?: string
  temperature?: number
}

/**
 * Creates an adapter for OpenAI-compatible clients (including Ollama via baseURL override).
 * Pass the OpenAI client instance, not the class.
 */
export function openaiAdapter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  defaults: OpenAiAdapterOptions = {},
): IAiAdapter {
  return {
    async complete(prompt: string, options: AdapterCallOptions = {}): Promise<string> {
      const response = await client.chat.completions.create({
        model: options.model ?? defaults.model ?? DEFAULT_MODEL,
        temperature: options.temperature ?? defaults.temperature ?? DEFAULT_TEMPERATURE,
        max_tokens: options.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
      const content = response.choices[0]?.message?.content
      if (!content) throw new Error('OpenAI returned an empty response')
      return content
    },
  }
}
