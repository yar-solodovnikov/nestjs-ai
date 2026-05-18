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
export function ollamaAdapter(options: OllamaAdapterOptions = {}): IAiAdapter {
  let cachedAdapter: IAiAdapter | null = null

  async function getAdapter(): Promise<IAiAdapter> {
    if (cachedAdapter) return cachedAdapter
    let OpenAI: typeof OpenAIClass
    try {
      const mod = await import('openai')
      OpenAI = mod.OpenAI
    } catch {
      throw new Error(
        'ollamaAdapter requires the openai package. Run: npm install openai',
      )
    }
    const client = new OpenAI({
      baseURL: options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
      apiKey: 'ollama',
    })
    cachedAdapter = openaiAdapter(client, {
      model: options.model ?? DEFAULT_OLLAMA_MODEL,
      temperature: options.temperature,
    })
    return cachedAdapter
  }

  return {
    async complete(prompt, callOptions) {
      const adapter = await getAdapter()
      return adapter.complete(prompt, callOptions)
    },
  }
}
