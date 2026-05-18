import { Inject } from '@nestjs/common'
import { AI_SERVICE } from './ai.constants'

/** Injects the AiService instance. */
export const InjectAi = (): ParameterDecorator => Inject(AI_SERVICE)
