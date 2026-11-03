import type { IAiAdapter, AdapterCallOptions } from './adapter.interface'
import { AiResponseError } from './response-error'

const DEFAULT_MODEL = 'claude-opus-5-5'
/**
 * Current Claude models think by default, and thinking counts toward max_tokens, so a small
 * limit truncates the answer. 16000 keeps non-streaming requests within SDK HTTP timeouts.
 */
const DEFAULT_MAX_TOKENS = 16000

/** Server-side refusal fallback: on a policy decline the API re-runs the request on a fallback model. */
const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01'
/** Models that accept `fallbacks: "default"`. */
const REFUSAL_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])
/** The fallbacks parameter is rejected on Amazon Bedrock, Google Vertex AI and Microsoft Foundry clients. */
const PARTNER_CLIENT_RE = /Bedrock|Vertex|Foundry/

export interface AnthropicAdapterOptions {
  model?: string
  maxTokens?: number
  /**
   * @deprecated Ignored. Claude 4.7+ models accept only the default sampling settings, and
   * Anthropic API version 2026-10-21 (sent by @anthropic-ai/sdk >= 1.0.0) rejects `temperature`
   * on every model, so the adapter never sends it. Per-call `temperature` is ignored as well.
   */
  temperature?: number
  /**
   * Enables Anthropic's server-side refusal fallback (`fallbacks: "default"`, beta
   * `server-side-fallback-2026-07-01`) for models that support it: if the model declines the request, the
   * API re-runs it on a fallback model within the same call. Default: true. Applied only to the
   * first-party Anthropic client; Bedrock, Vertex and Foundry clients do not support it.
   */
  refusalFallback?: boolean
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
      const model = options.model ?? defaults.model ?? DEFAULT_MODEL
      const params = {
        model,
        max_tokens: options.maxTokens ?? defaults.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }
      const response = useRefusalFallback(client, model, defaults)
        ? await client.beta.messages.create({ ...params, betas: [REFUSAL_FALLBACK_BETA], fallbacks: 'default' })
        : await client.messages.create(params)
      if (response.stop_reason === 'refusal') {
        const category: string | undefined = response.stop_details?.category ?? undefined
        throw new AiResponseError(
          `Anthropic declined the request${category ? ` (category: ${category})` : ''}`,
          'anthropic', 'refusal', category,
        )
      }
      if (response.stop_reason === 'max_tokens') {
        throw new AiResponseError(
          'Anthropic response was cut off by max_tokens; increase maxTokens',
          'anthropic', 'truncated', 'max_tokens',
        )
      }
      // The response may start with non-text blocks ("thinking" is on by default on current models).
      const text = (response.content as Array<{ type: string, text?: string }>)
        .filter(block => block.type === 'text')
        .map(block => block.text ?? '')
        .join('')
      if (!text) throw new Error('Anthropic returned an empty response')
      return text
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useRefusalFallback(client: any, model: string, defaults: AnthropicAdapterOptions): boolean {
  if (defaults.refusalFallback === false) return false
  if (!REFUSAL_FALLBACK_MODELS.has(model)) return false
  if (typeof client?.beta?.messages?.create !== 'function') return false
  return !PARTNER_CLIENT_RE.test(String(client?.constructor?.name ?? ''))
}
