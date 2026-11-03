import 'reflect-metadata'
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { AiService } from '../src/ai.service'
import type { IAiAdapter, AdapterCallOptions } from '../src/adapters/adapter.interface'

function makeAdapter(): IAiAdapter & { lastOptions: AdapterCallOptions | undefined } {
  let lastOptions: AdapterCallOptions | undefined
  return {
    async complete(_prompt, options) {
      lastOptions = options
      return '{"value":1}'
    },
    get lastOptions() { return lastOptions },
  }
}

describe('AiService', () => {
  // Bug fix: defaultMaxTokens was missing — model and temperature had global defaults but maxTokens did not
  it('passes defaultMaxTokens from module options to adapter', async () => {
    const adapter = makeAdapter()
    const service = new AiService({ adapter, defaultMaxTokens: 2048 })
    await service.chat('test')
    expect(adapter.lastOptions?.maxTokens).toBe(2048)
  })

  it('passes defaultModel and defaultTemperature to adapter', async () => {
    const adapter = makeAdapter()
    const service = new AiService({ adapter, defaultModel: 'gpt-4o', defaultTemperature: 0.7 })
    await service.chat('test')
    expect(adapter.lastOptions?.model).toBe('gpt-4o')
    expect(adapter.lastOptions?.temperature).toBe(0.7)
  })

  it('per-call options override module defaults', async () => {
    const adapter = makeAdapter()
    const service = new AiService({ adapter, defaultModel: 'gpt-4o-mini', defaultMaxTokens: 512 })
    await service.chat('test', { model: 'gpt-4o', maxTokens: 4096 })
    expect(adapter.lastOptions?.model).toBe('gpt-4o')
    expect(adapter.lastOptions?.maxTokens).toBe(4096)
  })

  it('parse() calls adapter and returns typed result', async () => {
    const Schema = z.object({ value: z.number() })
    const adapter = makeAdapter()
    const service = new AiService({ adapter })
    const result = await service.parse({ schema: Schema, prompt: 'test' })
    expect(result).toEqual({ value: 1 })
  })

  it('chat() returns raw string from adapter', async () => {
    const rawAdapter: IAiAdapter = { async complete() { return 'raw text' } }
    const service = new AiService({ adapter: rawAdapter })
    expect(await service.chat('hi')).toBe('raw text')
  })

  it('does not set model/temperature/maxTokens on adapter when none are configured', async () => {
    const adapter = makeAdapter()
    const service = new AiService({ adapter })
    await service.chat('test')
    expect(adapter.lastOptions?.model).toBeUndefined()
    expect(adapter.lastOptions?.temperature).toBeUndefined()
    expect(adapter.lastOptions?.maxTokens).toBeUndefined()
  })

  it('onRetry callback is forwarded to runWithRetry', async () => {
    const onRetry = vi.fn()
    const responses = ['bad json', '{"value":42}']
    let i = 0
    const retryAdapter: IAiAdapter = { async complete() { return responses[i++]! } }
    const service = new AiService({ adapter: retryAdapter })
    await service.parse({ schema: z.object({ value: z.number() }), prompt: 'test', retries: 3, onRetry })
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('parse() uses defaultRetryDelay and lets a per-call retryDelay override it', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(1)
    try {
      let calls = 0
      const flaky: IAiAdapter = {
        async complete() {
          calls++
          if (calls % 2 === 1) throw Object.assign(new Error('busy'), { status: 503 })
          return '{"value":1}'
        },
      }
      const service = new AiService({ adapter: flaky, defaultRetryDelay: 500 })
      const first = service.parse({ schema: z.object({ value: z.number() }), prompt: 'test' })
      await vi.advanceTimersByTimeAsync(499)
      expect(calls).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      await first
      expect(calls).toBe(2)

      await service.parse({ schema: z.object({ value: z.number() }), prompt: 'test', retryDelay: 0 })
      expect(calls).toBe(4)
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it('chat() reports request and successful response to the logger', async () => {
    const logger = { onRequest: vi.fn(), onResponse: vi.fn() }
    const service = new AiService({ adapter: makeAdapter(), logger, defaultModel: 'm' })
    await service.chat('hello')
    expect(logger.onRequest).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'hello', attempt: 1, adapterOptions: { model: 'm' } }))
    expect(logger.onResponse).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'hello', success: true }))
  })

  it('chat() reports a failed response to the logger and rethrows', async () => {
    const logger = { onResponse: vi.fn() }
    const adapter: IAiAdapter = { async complete() { throw new Error('down') } }
    const service = new AiService({ adapter, logger })
    await expect(service.chat('hello')).rejects.toThrow('down')
    expect(logger.onResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'down' }))
  })
})
