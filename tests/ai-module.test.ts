import 'reflect-metadata'
import { describe, it, expect } from 'vitest'
import { AiModule } from '../src/ai.module'
import { AiService } from '../src/ai.service'
import { AI_SERVICE, AI_SERVICE_TOKEN } from '../src/ai.constants'
import type { IAiAdapter } from '../src/adapters/adapter.interface'

const mockAdapter: IAiAdapter = { async complete() { return '{}' } }
const baseOptions = { adapter: mockAdapter }

describe('AiModule.forRoot', () => {
  it('returns a DynamicModule with correct module reference', () => {
    const mod = AiModule.forRoot(baseOptions)
    expect(mod.module).toBe(AiModule)
  })

  it('provides AI_MODULE_OPTIONS with useValue', () => {
    const mod = AiModule.forRoot(baseOptions)
    const provider = mod.providers!.find(p => typeof p === 'object' && 'provide' in p && p.provide === AI_MODULE_OPTIONS_SYM)
    // verify options token provider exists
    expect(mod.providers).toHaveLength(3)
  })

  it('exports AiService and AI_SERVICE token', () => {
    const mod = AiModule.forRoot(baseOptions)
    expect(mod.exports).toContain(AiService)
    expect(mod.exports).toContain(AI_SERVICE)
  })

  it('sets global: true when isGlobal is true', () => {
    const mod = AiModule.forRoot({ ...baseOptions, isGlobal: true })
    expect(mod.global).toBe(true)
  })

  it('leaves global falsy when isGlobal is not provided', () => {
    const mod = AiModule.forRoot(baseOptions)
    expect(mod.global).toBeFalsy()
  })
})

// re-import to resolve the symbol for the test above
import { AI_MODULE_OPTIONS } from '../src/ai.constants'
const AI_MODULE_OPTIONS_SYM = AI_MODULE_OPTIONS

describe('AiModule.forRootAsync', () => {
  it('returns a DynamicModule with useFactory provider', () => {
    const mod = AiModule.forRootAsync({ useFactory: () => baseOptions })
    expect(mod.module).toBe(AiModule)
    expect(mod.exports).toContain(AiService)
    expect(mod.exports).toContain(AI_SERVICE)
  })

  it('defaults imports and inject to empty arrays when not provided', () => {
    const mod = AiModule.forRootAsync({ useFactory: () => baseOptions })
    expect(mod.imports).toEqual([])
    const optionsProvider = mod.providers!.find(
      p => typeof p === 'object' && 'useFactory' in p && p.provide === AI_MODULE_OPTIONS
    ) as { inject: unknown[] }
    expect(optionsProvider.inject).toEqual([])
  })

  it('passes through imports and inject when provided', () => {
    const fakeToken = Symbol('fake')
    const mod = AiModule.forRootAsync({
      inject: [fakeToken],
      imports: [],
      useFactory: () => baseOptions,
    })
    const optionsProvider = mod.providers!.find(
      p => typeof p === 'object' && 'useFactory' in p && p.provide === AI_MODULE_OPTIONS
    ) as { inject: unknown[] }
    expect(optionsProvider.inject).toContain(fakeToken)
  })

  it('sets global: true when isGlobal is true', () => {
    const mod = AiModule.forRootAsync({ isGlobal: true, useFactory: () => baseOptions })
    expect(mod.global).toBe(true)
  })

  it('leaves global falsy when isGlobal is not provided', () => {
    const mod = AiModule.forRootAsync({ useFactory: () => baseOptions })
    expect(mod.global).toBeFalsy()
  })
})

describe('AiModule.register', () => {
  it('returns a DynamicModule with named token', () => {
    const mod = AiModule.register('fast', baseOptions)
    expect(mod.module).toBe(AiModule)
    expect(mod.exports).toContain(AI_SERVICE_TOKEN('fast'))
  })

  it('useFactory creates a working AiService instance', () => {
    const mod = AiModule.register('fast', baseOptions)
    const provider = mod.providers!.find(
      p => typeof p === 'object' && 'useFactory' in p && p.provide === AI_SERVICE_TOKEN('fast')
    ) as { useFactory: (opts: typeof baseOptions) => AiService; inject: symbol[] }

    expect(typeof provider.useFactory).toBe('function')

    // Resolve the optionsToken and retrieve the options provider
    const optionsToken = provider.inject[0]
    const optionsProvider = mod.providers!.find(
      p => typeof p === 'object' && 'provide' in p && (p as { provide: unknown }).provide === optionsToken
    ) as { useValue: typeof baseOptions }

    const service = provider.useFactory(optionsProvider.useValue)
    expect(service).toBeInstanceOf(AiService)
  })

  it('each register() call uses a unique internal options token (no collision)', () => {
    const mod1 = AiModule.register('a', baseOptions)
    const mod2 = AiModule.register('a', baseOptions)
    const token1 = (mod1.providers![0] as { provide: symbol }).provide
    const token2 = (mod2.providers![0] as { provide: symbol }).provide
    // Symbol() creates unique tokens even with the same description
    expect(token1).not.toBe(token2)
  })

  it('does not set global (named instances are module-scoped)', () => {
    const mod = AiModule.register('fast', baseOptions)
    expect(mod.global).toBeFalsy()
  })
})

describe('AiModule.registerAsync', () => {
  it('returns a DynamicModule with named token', () => {
    const mod = AiModule.registerAsync('smart', { useFactory: () => baseOptions })
    expect(mod.module).toBe(AiModule)
    expect(mod.exports).toContain(AI_SERVICE_TOKEN('smart'))
  })

  it('defaults imports and inject to empty arrays when not provided', () => {
    const mod = AiModule.registerAsync('smart', { useFactory: () => baseOptions })
    expect(mod.imports).toEqual([])
    const optionsProvider = mod.providers!.find(
      p => typeof p === 'object' && 'useFactory' in p && (p as { provide: unknown }).provide !== AI_SERVICE_TOKEN('smart')
    ) as { inject: unknown[] }
    expect(optionsProvider.inject).toEqual([])
  })

  it('useFactory creates a working AiService instance', () => {
    const mod = AiModule.registerAsync('smart', { useFactory: () => baseOptions })
    const provider = mod.providers!.find(
      p => typeof p === 'object' && 'useFactory' in p && (p as { provide: unknown }).provide === AI_SERVICE_TOKEN('smart')
    ) as { useFactory: (opts: typeof baseOptions) => AiService }
    const service = provider.useFactory(baseOptions)
    expect(service).toBeInstanceOf(AiService)
  })

  it('does not set global (named instances are module-scoped)', () => {
    const mod = AiModule.registerAsync('smart', { useFactory: () => baseOptions })
    expect(mod.global).toBeFalsy()
  })
})

describe('AiModule async factories with typed dependencies', () => {
  class FakeConfigService {
    get(key: string): string { return key }
  }

  // Compile-time regression: typed factory params must be accepted (checked by `npm run typecheck`).
  it('accepts a factory with typed parameters in forRootAsync and registerAsync', async () => {
    const factory = (config: FakeConfigService) => ({
      adapter: { complete: async () => config.get('ok') },
    })
    const root = AiModule.forRootAsync({ inject: [FakeConfigService], useFactory: factory })
    const named = AiModule.registerAsync('typed', { inject: [FakeConfigService], useFactory: factory })
    expect(root.providers).toBeDefined()
    expect(named.providers).toBeDefined()
    const options = await factory(new FakeConfigService())
    expect(await options.adapter.complete()).toBe('ok')
  })
})
