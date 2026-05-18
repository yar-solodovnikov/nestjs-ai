import { Inject } from '@nestjs/common'
import { AI_SERVICE, AI_SERVICE_TOKEN } from './ai.constants'

/**
 * Injects the AiService instance.
 * Pass a name to inject a named instance registered with AiModule.register().
 *
 * @example
 * @InjectAi() ai: AiService           // default instance
 * @InjectAi('fast') fast: AiService   // named instance
 */
export const InjectAi = (name?: string): ParameterDecorator =>
  Inject(name ? AI_SERVICE_TOKEN(name) : AI_SERVICE)
