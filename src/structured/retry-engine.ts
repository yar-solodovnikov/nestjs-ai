import type { ZodTypeAny, z } from 'zod'
import type { IAiAdapter, AdapterCallOptions } from '../adapters/adapter.interface'
import { parseJson } from './output-parser'
import { zodToPrompt } from './zod-to-prompt'

export class AiError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastRaw: string,
    public readonly lastZodError?: string,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export interface RetryOptions<T extends ZodTypeAny> {
  adapter: IAiAdapter
  schema: T
  prompt: string
  retries?: number
  onRetry?: (attempt: number, error: Error) => void
  adapterOptions?: AdapterCallOptions
}

const DEFAULT_RETRIES = 3

/**
 * Sends a prompt to the LLM, validates the response against the Zod schema,
 * and retries with the validation error as context if the response is invalid.
 */
export async function runWithRetry<T extends ZodTypeAny>(
  options: RetryOptions<T>,
): Promise<z.infer<T>> {
  const { adapter, schema, retries = DEFAULT_RETRIES, onRetry, adapterOptions } = options

  const schemaHint = zodToPrompt(schema)
  let prompt = `${options.prompt}\n\n${schemaHint}`
  let lastRaw = ''
  let lastZodError = ''

  for (let attempt = 1; attempt <= retries; attempt++) {
    lastRaw = await adapter.complete(prompt, adapterOptions)

    try {
      const parsed = parseJson(lastRaw)
      const result = schema.safeParse(parsed)

      if (result.success) return result.data

      lastZodError = result.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ')

      const error = new Error(`Validation failed: ${lastZodError}`)
      onRetry?.(attempt, error)

      // Feed the exact error back so the model can self-correct
      prompt = `${options.prompt}\n\n${schemaHint}\n\nPrevious attempt returned invalid JSON.\nValidation error: ${lastZodError}\nPlease fix and return only valid JSON.`
    } catch (parseError) {
      const error = parseError instanceof Error ? parseError : new Error(String(parseError))
      onRetry?.(attempt, error)
      prompt = `${options.prompt}\n\n${schemaHint}\n\nPrevious attempt could not be parsed as JSON: ${lastRaw}\nReturn only valid JSON.`
    }
  }

  throw new AiError(
    `Failed to get valid response after ${retries} attempts`,
    retries,
    lastRaw,
    lastZodError,
  )
}
