import { DynamicModule, FactoryProvider, Module, ModuleMetadata } from '@nestjs/common'
import { AI_MODULE_OPTIONS, AI_SERVICE, AI_SERVICE_TOKEN } from './ai.constants'
import { AiService, type AiModuleOptions } from './ai.service'

export interface AiModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: FactoryProvider['inject']
  useFactory: (...args: unknown[]) => AiModuleOptions | Promise<AiModuleOptions>
}

@Module({})
export class AiModule {
  /** Register a single default AiService instance. */
  static forRoot(options: AiModuleOptions): DynamicModule {
    return {
      module: AiModule,
      providers: [
        { provide: AI_MODULE_OPTIONS, useValue: options },
        { provide: AI_SERVICE, useClass: AiService },
        AiService,
      ],
      exports: [AiService, AI_SERVICE],
    }
  }

  /** Register the default AiService instance using an async factory (e.g. with ConfigService). */
  static forRootAsync(asyncOptions: AiModuleAsyncOptions): DynamicModule {
    return {
      module: AiModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: AI_MODULE_OPTIONS,
          inject: asyncOptions.inject ?? [],
          useFactory: asyncOptions.useFactory,
        },
        { provide: AI_SERVICE, useClass: AiService },
        AiService,
      ],
      exports: [AiService, AI_SERVICE],
    }
  }

  /**
   * Register a named AiService instance — useful for multiple providers in one app.
   *
   * @example
   * AiModule.register('fast', { adapter: openaiAdapter(client, { model: 'gpt-4o-mini' }) })
   * AiModule.register('smart', { adapter: openaiAdapter(client, { model: 'gpt-4o' }) })
   *
   * // Then inject by name:
   * @InjectAi('fast') private fast: AiService
   * @InjectAi('smart') private smart: AiService
   */
  static register(name: string, options: AiModuleOptions): DynamicModule {
    const token = AI_SERVICE_TOKEN(name)
    const optionsToken = Symbol(`AI_MODULE_OPTIONS_${name}`)
    return {
      module: AiModule,
      providers: [
        { provide: optionsToken, useValue: options },
        { provide: token, useFactory: (opts: AiModuleOptions) => new AiService(opts), inject: [optionsToken] },
      ],
      exports: [token],
    }
  }

  /** Async version of register() for named instances. */
  static registerAsync(name: string, asyncOptions: AiModuleAsyncOptions): DynamicModule {
    const token = AI_SERVICE_TOKEN(name)
    const optionsToken = Symbol(`AI_MODULE_OPTIONS_${name}`)
    return {
      module: AiModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: optionsToken,
          inject: asyncOptions.inject ?? [],
          useFactory: asyncOptions.useFactory,
        },
        { provide: token, useFactory: (opts: AiModuleOptions) => new AiService(opts), inject: [optionsToken] },
      ],
      exports: [token],
    }
  }
}
