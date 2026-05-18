import { openaiAdapter, type OpenAiAdapterOptions } from './openai.adapter'
import type { IAiAdapter } from './adapter.interface'

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1'
const DEFAULT_OLLAMA_MODEL = 'llama3.2'
const DEFAULT_OLLAMA_RETRIES = 5

export interface OllamaAdapterOptions extends OpenAiAdapterOptions {
  baseUrl?: string
  model?: string
}

/**
 * Adapter for local Ollama models.
 * Ollama is OpenAI-API-compatible — this is a thin wrapper over openaiAdapter.
 * Higher default retries because local models are less reliable with JSON output.
 */
export function ollamaAdapter(options: OllamaAdapterOptions = {}): IAiAdapter {
  const { OpenAI } = require('openai') as typeof import('openai')
  const client = new OpenAI({
    baseURL: options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
    apiKey: 'ollama',
  })
  return openaiAdapter(client, {
    model: options.model ?? DEFAULT_OLLAMA_MODEL,
    temperature: options.temperature,
  })
}

export { DEFAULT_OLLAMA_RETRIES }
