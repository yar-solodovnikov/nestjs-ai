import { DynamicModule, FactoryProvider, Module, ModuleMetadata } from '@nestjs/common'
import { AI_MODULE_OPTIONS, AI_SERVICE, AI_SERVICE_TOKEN } from './ai.constants'
import { AiService, type AiModuleOptions } from './ai.service'

export interface AiModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: FactoryProvider['inject']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches Nest's FactoryProvider so typed factory params are accepted
  useFactory: (...args: any[]) => AiModuleOptions | Promise<AiModuleOptions>
  /** When true, the module is registered globally and does not need to be imported in every feature module. */
  isGlobal?: boolean
}

/** Options for named instances (register/registerAsync). isGlobal has no meaning for named instances. */
export interface AiModuleNamedAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: FactoryProvider['inject']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches Nest's FactoryProvider so typed factory params are accepted
  useFactory: (...args: any[]) => AiModuleOptions | Promise<AiModuleOptions>
}

@Module({})
export class AiModule {
  /** Register a single default AiService instance. */
  static forRoot(options: AiModuleOptions): DynamicModule {
    return {
      global: options.isGlobal,
      module: AiModule,
      providers: [
        { provide: AI_MODULE_OPTIONS, useValue: options },
        AiService,
        { provide: AI_SERVICE, useExisting: AiService },
      ],
      exports: [AiService, AI_SERVICE],
    }
  }

  /** Register the default AiService instance using an async factory (e.g. with ConfigService). */
  static forRootAsync(asyncOptions: AiModuleAsyncOptions): DynamicModule {
    return {
      global: asyncOptions.isGlobal,
      module: AiModule,
      imports: asyncOptions.imports ?? [],
      providers: [
        {
          provide: AI_MODULE_OPTIONS,
          inject: asyncOptions.inject ?? [],
          useFactory: asyncOptions.useFactory,
        },
        AiService,
        { provide: AI_SERVICE, useExisting: AiService },
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
  static register(name: string, options: Omit<AiModuleOptions, 'isGlobal'>): DynamicModule {
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
  static registerAsync(name: string, asyncOptions: AiModuleNamedAsyncOptions): DynamicModule {
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
