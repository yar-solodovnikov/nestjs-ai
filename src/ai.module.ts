import { DynamicModule, Module } from '@nestjs/common'
import { AI_MODULE_OPTIONS, AI_SERVICE } from './ai.constants'
import { AiService, type AiModuleOptions } from './ai.service'

export interface AiModuleAsyncOptions {
  inject?: unknown[]
  useFactory: (...args: unknown[]) => AiModuleOptions | Promise<AiModuleOptions>
  imports?: unknown[]
}

@Module({})
export class AiModule {
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

  static forRootAsync(asyncOptions: AiModuleAsyncOptions): DynamicModule {
    return {
      module: AiModule,
      imports: (asyncOptions.imports ?? []) as DynamicModule[],
      providers: [
        {
          provide: AI_MODULE_OPTIONS,
          inject: (asyncOptions.inject ?? []) as string[],
          useFactory: asyncOptions.useFactory,
        },
        { provide: AI_SERVICE, useClass: AiService },
        AiService,
      ],
      exports: [AiService, AI_SERVICE],
    }
  }
}
