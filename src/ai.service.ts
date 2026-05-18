import { Inject, Injectable } from '@nestjs/common'
import type { ZodTypeAny, z } from 'zod'
import { AI_MODULE_OPTIONS } from './ai.constants'
import type { IAiAdapter, AdapterCallOptions } from './adapters/adapter.interface'
import type { AiLogger } from './ai.logger'
import { runWithRetry, type RetryOptions } from './structured/retry-engine'

export interface AiModuleOptions {
  adapter: IAiAdapter
  defaultRetries?: number
  defaultModel?: string
  defaultTemperature?: number
  /** Optional logger for request/response/retry events. */
  logger?: AiLogger
}

export interface ParseOptions extends AdapterCallOptions {
  retries?: number
  onRetry?: (attempt: number, error: Error) => void
}

@Injectable()
export class AiService {
  private readonly adapter: IAiAdapter
  private readonly defaultRetries: number
  private readonly logger?: AiLogger

  constructor(@Inject(AI_MODULE_OPTIONS) private readonly options: AiModuleOptions) {
    this.adapter = options.adapter
    this.defaultRetries = options.defaultRetries ?? 3
    this.logger = options.logger
  }

  /**
   * Sends a prompt to the LLM and returns a validated, fully-typed result.
   * Automatically retries with Zod error context on validation failure.
   */
  async parse<T extends ZodTypeAny>(params: {
    schema: T
    prompt: string
  } & ParseOptions): Promise<z.infer<T>> {
    const retryOptions: RetryOptions<T> = {
      adapter: this.adapter,
      schema: params.schema,
      prompt: params.prompt,
      retries: params.retries ?? this.defaultRetries,
      adapterOptions: this.mergeAdapterOptions(params),
      logger: this.logger,
    }
    if (params.onRetry) retryOptions.onRetry = params.onRetry
    return runWithRetry(retryOptions)
  }

  /**
   * Sends a plain prompt and returns the raw string response.
   */
  async chat(prompt: string, options?: AdapterCallOptions): Promise<string> {
    return this.adapter.complete(prompt, this.mergeAdapterOptions(options))
  }

  private mergeAdapterOptions(overrides?: AdapterCallOptions): AdapterCallOptions {
    const result: AdapterCallOptions = {}
    const model = overrides?.model ?? this.options.defaultModel
    const temperature = overrides?.temperature ?? this.options.defaultTemperature
    const maxTokens = overrides?.maxTokens
    if (model !== undefined) result.model = model
    if (temperature !== undefined) result.temperature = temperature
    if (maxTokens !== undefined) result.maxTokens = maxTokens
    return result
  }
}
