import type { IAiAdapter, AdapterCallOptions } from './adapter.interface'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_MAX_TOKENS = 1024

export interface AnthropicAdapterOptions {
  model?: string
  maxTokens?: number
  /**
   * @deprecated Ignored. Claude 4.7+ models accept only the default sampling settings, and
   * Anthropic API version 2026-10-21 (sent by @anthropic-ai/sdk >= 1.0.0) rejects `temperature`
   * on every model, so the adapter never sends it. Per-call `temperature` is ignored as well.
   */
  temperature?: number
}

/**
 * Creates an adapter for the Anthropic SDK client.
 * Pass the Anthropic client instance, not the class.
 */
export function anthropicAdapter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  client: any,
  defaults: AnthropicAdapterOptions = {},
): IAiAdapter {
  return {
    async complete(prompt: string, options: AdapterCallOptions = {}): Promise<string> {
      const response = await client.messages.create({
        model: options.model ?? defaults.model ?? DEFAULT_MODEL,
        max_tokens: options.maxTokens ?? defaults.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      })
      // The response may start with non-text blocks (e.g. "thinking" with extended thinking enabled).
      const text = (response.content as Array<{ type: string, text?: string }>)
        .filter(block => block.type === 'text')
        .map(block => block.text ?? '')
        .join('')
      if (!text) throw new Error('Anthropic returned an empty response')
      return text
    },
  }
}
