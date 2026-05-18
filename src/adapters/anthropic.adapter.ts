import type { IAiAdapter, AdapterCallOptions } from './adapter.interface'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_TEMPERATURE = 0

export interface AnthropicAdapterOptions {
  model?: string
  maxTokens?: number
  temperature?: number
}

/**
 * Creates an adapter for the Anthropic SDK client.
 * Pass the Anthropic client instance, not the class.
 */
export function anthropicAdapter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  defaults: AnthropicAdapterOptions = {},
): IAiAdapter {
  return {
    async complete(prompt: string, options: AdapterCallOptions = {}): Promise<string> {
      const response = await client.messages.create({
        model: options.model ?? defaults.model ?? DEFAULT_MODEL,
        max_tokens: options.maxTokens ?? defaults.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options.temperature ?? defaults.temperature ?? DEFAULT_TEMPERATURE,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = response.content[0]
      if (!block || block.type !== 'text') throw new Error('Anthropic returned an empty response')
      return block.text
    },
  }
}
