import type { OpenAI as OpenAIClass } from 'openai'
import { openaiAdapter, type OpenAiAdapterOptions } from './openai.adapter'
import type { IAiAdapter } from './adapter.interface'

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1'
const DEFAULT_OLLAMA_MODEL = 'llama3.2'
export interface OllamaAdapterOptions extends OpenAiAdapterOptions {
  baseUrl?: string
  model?: string
}

/**
 * Adapter for local Ollama models.
 * Ollama is OpenAI-API-compatible — thin wrapper over openaiAdapter.
 * Uses dynamic import so the openai package is only loaded on first call.
 */
function isModuleNotFound(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND'
}

export function ollamaAdapter(options: OllamaAdapterOptions = {}): IAiAdapter {
  let adapterPromise: Promise<IAiAdapter> | null = null

  async function createAdapter(): Promise<IAiAdapter> {
    let OpenAI: typeof OpenAIClass
    try {
      const mod = await import('openai')
      OpenAI = mod.OpenAI
    } catch (error) {
      if (!isModuleNotFound(error)) throw error
      throw new Error(
        'ollamaAdapter requires the openai package. Run: npm install openai',
        { cause: error },
      )
    }
    const client = new OpenAI({
      baseURL: options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
      apiKey: 'ollama',
    })
    return openaiAdapter(client, {
      model: options.model ?? DEFAULT_OLLAMA_MODEL,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    })
  }

  return {
    async complete(prompt, callOptions) {
      // Do not cache a failed initialization, so a later call can try again.
      adapterPromise ??= createAdapter().catch((error: unknown) => {
        adapterPromise = null
        throw error
      })
      const adapter = await adapterPromise
      return adapter.complete(prompt, callOptions)
    },
  }
}
