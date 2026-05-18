export interface IAiAdapter {
  /** Send a prompt and return the raw LLM response string. */
  complete(prompt: string, options?: AdapterCallOptions): Promise<string>
}

export interface AdapterCallOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}
