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
    /** The error from the last failed attempt (adapter, JSON parse or validation error). */
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AiError'
    Object.setPrototypeOf(this, AiError.prototype)
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

export const DEFAULT_RETRIES = 3
const MAX_RAW_IN_PROMPT = 500
const MAX_ZOD_ERROR_IN_PROMPT = 500
const HTTP_CLIENT_ERROR_MIN = 400
const HTTP_SERVER_ERROR_MIN = 500
const HTTP_REQUEST_TIMEOUT = 408
const HTTP_CONFLICT = 409
const HTTP_TOO_MANY_REQUESTS = 429
/** 4xx statuses that are worth retrying. */
const RETRYABLE_CLIENT_STATUSES = new Set([HTTP_REQUEST_TIMEOUT, HTTP_CONFLICT, HTTP_TOO_MANY_REQUESTS])

/**
 * Client errors (bad API key, unknown model, invalid request) will fail the same way on every
 * attempt, so retrying them only wastes time and tokens. Rate limits and server errors are retried.
 * Works with OpenAI, Anthropic and Gemini SDK errors, which all expose an HTTP `status`.
 * Errors that set `retryable: false` (e.g. AiResponseError for truncated or refused answers) are not retried.
 */
function isRetryableAdapterError(error: unknown): boolean {
  if ((error as { retryable?: unknown } | null)?.retryable === false) return false
  const status = (error as { status?: unknown } | null)?.status
  if (typeof status !== 'number') return true
  if (status >= HTTP_CLIENT_ERROR_MIN && status < HTTP_SERVER_ERROR_MIN) return RETRYABLE_CLIENT_STATUSES.has(status)
  return true
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export async function runWithRetry<T extends ZodTypeAny>(
  options: RetryOptions<T>,
): Promise<z.infer<T>> {
  const { adapter, schema, retries = DEFAULT_RETRIES, onRetry, adapterOptions, logger } = options
  if (!Number.isInteger(retries) || retries < 1) {
    throw new RangeError(`retries must be an integer >= 1 (total number of attempts), got ${retries}`)
  }

  const schemaHint = zodToPrompt(schema)
  let prompt = `${options.prompt}\n\n${schemaHint}`
  let lastRaw = ''
  let lastZodError = ''
  let lastError: Error | undefined
  let attemptsMade = 0

  for (let attempt = 1; attempt <= retries; attempt++) {
    const hasMoreAttempts = attempt < retries
    logger?.onRequest?.({ prompt: options.prompt, attempt, adapterOptions: adapterOptions as Record<string, unknown> })
    const start = Date.now()
    attemptsMade = attempt

    // Step 1: call the adapter
    let raw: string
    try {
      raw = await adapter.complete(prompt, adapterOptions)
    } catch (adapterError) {
      const error = toError(adapterError)
      lastError = error
      logger?.onResponse?.({ prompt: options.prompt, attempt, durationMs: Date.now() - start, success: false, error: error.message })
      if (!isRetryableAdapterError(adapterError)) break
      if (hasMoreAttempts) {
        onRetry?.(attempt, error)
        logger?.onRetry?.(attempt, error)
      }
      continue
    }

    // lastRaw and lastZodError always describe the same response
    lastRaw = raw
    lastZodError = ''

    // Step 2: parse the raw string into a value
    let parsed: unknown
    try {
      parsed = parseJson(raw)
    } catch (parseError) {
      const error = toError(parseError)
      lastError = error
      logger?.onResponse?.({ prompt: options.prompt, attempt, durationMs: Date.now() - start, success: false, error: error.message })
      if (hasMoreAttempts) {
        onRetry?.(attempt, error)
        logger?.onRetry?.(attempt, error)
        const rawPreview = raw.slice(0, MAX_RAW_IN_PROMPT)
        prompt = `${options.prompt}\n\n${schemaHint}\n\nPrevious attempt could not be parsed as JSON: ${rawPreview}\nReturn only valid JSON.`
      }
      continue
    }

    // Step 3: validate against the Zod schema
    const result = schema.safeParse(parsed)

    if (result.success) {
      logger?.onResponse?.({ prompt: options.prompt, attempt, durationMs: Date.now() - start, success: true })
      return result.data
    }

    lastZodError = result.error.issues
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ')

    const validationError = new Error(`Validation failed: ${lastZodError}`)
    lastError = validationError
    logger?.onResponse?.({ prompt: options.prompt, attempt, durationMs: Date.now() - start, success: false, error: lastZodError })

    if (hasMoreAttempts) {
      onRetry?.(attempt, validationError)
      logger?.onRetry?.(attempt, validationError)
      const zodErrorPreview = lastZodError.slice(0, MAX_ZOD_ERROR_IN_PROMPT)
      prompt = `${options.prompt}\n\n${schemaHint}\n\nPrevious attempt returned invalid data.\nValidation error: ${zodErrorPreview}\nPlease fix and return only valid JSON.`
    }
  }

  const reason = lastError ? `: ${lastError.message}` : ''
  throw new AiError(
    `Failed to get valid response after ${attemptsMade} attempt${attemptsMade === 1 ? '' : 's'}${reason}`,
    attemptsMade,
    lastRaw,
    lastZodError || undefined,
    lastError,
  )
}
