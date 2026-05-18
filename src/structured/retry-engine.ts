import type { ZodTypeAny, z } from 'zod'
import type { IAiAdapter, AdapterCallOptions } from '../adapters/adapter.interface'
import type { AiLogger } from '../ai.logger'
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
  logger?: AiLogger
}

const DEFAULT_RETRIES = 3

/**
 * Sends a prompt to the LLM, validates the response against the Zod schema,
 * and retries with the validation error as context if the response is invalid.
 */
export async function runWithRetry<T extends ZodTypeAny>(
  options: RetryOptions<T>,
): Promise<z.infer<T>> {
  const { adapter, schema, retries = DEFAULT_RETRIES, onRetry, adapterOptions, logger } = options

  const schemaHint = zodToPrompt(schema)
  let prompt = `${options.prompt}\n\n${schemaHint}`
  let lastRaw = ''
  let lastZodError = ''

  for (let attempt = 1; attempt <= retries; attempt++) {
    logger?.onRequest?.({ prompt: options.prompt, attempt, adapterOptions: adapterOptions as Record<string, unknown> })
    const start = Date.now()

    try {
      lastRaw = await adapter.complete(prompt, adapterOptions)
      const parsed = parseJson(lastRaw)
      const result = schema.safeParse(parsed)

      if (result.success) {
        logger?.onResponse?.({ prompt: options.prompt, attempt, durationMs: Date.now() - start, success: true })
        return result.data
      }

      lastZodError = result.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ')

      const error = new Error(`Validation failed: ${lastZodError}`)
      logger?.onResponse?.({ prompt: options.prompt, attempt, durationMs: Date.now() - start, success: false, error: lastZodError })
      onRetry?.(attempt, error)
      logger?.onRetry?.(attempt, error)

      prompt = `${options.prompt}\n\n${schemaHint}\n\nPrevious attempt returned invalid JSON.\nValidation error: ${lastZodError}\nPlease fix and return only valid JSON.`
    } catch (parseError) {
      const error = parseError instanceof Error ? parseError : new Error(String(parseError))
      logger?.onResponse?.({ prompt: options.prompt, attempt, durationMs: Date.now() - start, success: false, error: error.message })
      onRetry?.(attempt, error)
      logger?.onRetry?.(attempt, error)
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
