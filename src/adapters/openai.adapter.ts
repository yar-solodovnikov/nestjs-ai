import type { IAiAdapter, AdapterCallOptions } from './adapter.interface'
import { AiResponseError } from './response-error'

const DEFAULT_MODEL = 'gpt-6-luna'
const DEFAULT_TEMPERATURE = 0
/**
 * Reasoning models (o1, o3, o4-mini, gpt-5 and later generations such as gpt-6-luna) reject
 * `max_tokens` and any temperature other than the default, so they need `max_completion_tokens`
 * and no temperature unless set explicitly. `gpt-5-chat-*` variants behave like regular chat
 * models. Matches provider-prefixed ids too.
 */
const REASONING_MODEL_RE = /(?:^|\/)(?:o\d|gpt-(?:[5-9]|[1-9]\d))(?![\w.-]*-chat)/i
/**
 * Thinking models served through OpenAI-compatible APIs (Ollama, vLLM: qwen3, deepseek-r1…)
 * may put their reasoning inline as a leading <think>…</think> block. It is not part of the answer.
 */
const LEADING_THINK_BLOCK_RE = /^\s*<think>[\s\S]*?<\/think>\s*/

export interface OpenAiAdapterOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

/**
 * Creates an adapter for OpenAI-compatible clients (including Ollama via baseURL override).
 * Pass the OpenAI client instance, not the class.
 */
export function openaiAdapter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  client: any,
  defaults: OpenAiAdapterOptions = {},
): IAiAdapter {
  return {
    async complete(prompt: string, options: AdapterCallOptions = {}): Promise<string> {
      const model = options.model ?? defaults.model ?? DEFAULT_MODEL
      const isReasoningModel = REASONING_MODEL_RE.test(model)
      const temperature = options.temperature ?? defaults.temperature
        ?? (isReasoningModel ? undefined : DEFAULT_TEMPERATURE)
      const maxTokens = options.maxTokens ?? defaults.maxTokens

      const request: Record<string, unknown> = {
        model,
        messages: [{ role: 'user', content: prompt }],
      }
      if (temperature !== undefined) request.temperature = temperature
      if (maxTokens !== undefined) request[isReasoningModel ? 'max_completion_tokens' : 'max_tokens'] = maxTokens

      const response = await client.chat.completions.create(request)
      const choice = response.choices[0]
      const refusal: string | null | undefined = choice?.message?.refusal
      if (refusal) {
        throw new AiResponseError(`OpenAI declined the request: ${refusal}`, 'openai', 'refusal', refusal)
      }
      if (choice?.finish_reason === 'length') {
        throw new AiResponseError(
          'OpenAI response was cut off by the token limit; increase maxTokens',
          'openai', 'truncated', 'length',
        )
      }
      if (choice?.finish_reason === 'content_filter') {
        throw new AiResponseError('OpenAI content filter blocked the response', 'openai', 'blocked', 'content_filter')
      }
      const raw: string | null | undefined = choice?.message?.content
      const content = raw?.replace(LEADING_THINK_BLOCK_RE, '')
      if (!content) throw new Error('OpenAI returned an empty response')
      return content
    },
  }
}
