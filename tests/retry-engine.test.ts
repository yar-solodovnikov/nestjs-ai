import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { runWithRetry, AiError } from '../src/structured/retry-engine'
import { AiResponseError } from '../src/adapters/response-error'
import type { IAiAdapter } from '../src/adapters/adapter.interface'
import type { AiLogger } from '../src/ai.logger'

const UserSchema = z.object({ name: z.string(), age: z.number() })

function makeAdapter(responses: string[]): IAiAdapter {
  let i = 0
  return {
    async complete() {
      const res = responses[i++]
      if (res === undefined) throw new Error('No more responses')
      return res
    },
  }
}

describe('runWithRetry', () => {
  it('returns valid result on first attempt', async () => {
    const adapter = makeAdapter(['{"name":"John","age":25}'])
    const result = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test' })
    expect(result).toEqual({ name: 'John', age: 25 })
  })

  it('retries after invalid JSON and succeeds', async () => {
    const adapter = makeAdapter(['not json at all', '{"name":"John","age":25}'])
    const result = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3 })
    expect(result).toEqual({ name: 'John', age: 25 })
  })

  it('retries after Zod validation failure and succeeds', async () => {
    const adapter = makeAdapter(['{"name":"John","age":"twenty"}', '{"name":"John","age":25}'])
    const result = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3 })
    expect(result).toEqual({ name: 'John', age: 25 })
  })

  it('throws AiError after exhausting retries', async () => {
    const adapter = makeAdapter(['bad', 'bad', 'bad'])
    await expect(
      runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3 })
    ).rejects.toBeInstanceOf(AiError)
  })

  it('AiError contains attempt count and last raw response', async () => {
    const adapter = makeAdapter(['bad1', 'bad2', 'bad3'])
    const err = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.attempts).toBe(3)
    expect(err.lastRaw).toBe('bad3')
  })

  it('calls onRetry callback with attempt number', async () => {
    const onRetry = vi.fn()
    const adapter = makeAdapter(['bad', '{"name":"John","age":25}'])
    await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry })
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
  })

  it('does not call onRetry on the last failed attempt', async () => {
    const onRetry = vi.fn()
    const adapter = makeAdapter(['bad', 'bad', 'bad'])
    await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry })
      .catch(() => {})
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('does not call onRetry when retries=1', async () => {
    const onRetry = vi.fn()
    const adapter = makeAdapter(['bad'])
    await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 1, onRetry })
      .catch(() => {})
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('AiError.lastZodError is undefined when adapter always throws (Zod never ran)', async () => {
    const throwingAdapter: IAiAdapter = {
      async complete() { throw new Error('network error') },
    }
    const err: AiError = await runWithRetry({ retryDelay: 0, adapter: throwingAdapter, schema: UserSchema, prompt: 'test', retries: 3 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.lastZodError).toBeUndefined()
  })

  it('AiError.lastZodError contains Zod error message when validation failed', async () => {
    const adapter = makeAdapter([
      '{"name":"John","age":"wrong"}',
      '{"name":123,"age":"wrong"}',
      '{"name":123,"age":"wrong"}',
    ])
    const err: AiError = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.lastZodError).toBeDefined()
    expect(err.lastZodError).toContain('age')
  })

  it('AiError instanceof check works and name is "AiError"', async () => {
    const adapter = makeAdapter(['bad'])
    const err = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 1 })
      .catch(e => e)
    expect(err instanceof AiError).toBe(true)
    expect(err instanceof Error).toBe(true)
    expect(err.name).toBe('AiError')
    expect(Object.getPrototypeOf(err)).toBe(AiError.prototype)
  })

  it('handles non-Error thrown from adapter (wraps string in Error)', async () => {
    const adapter: IAiAdapter = {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      async complete() { throw 'string error' as unknown },
    }
    const err = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 1 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.lastZodError).toBeUndefined()
  })

  it('calls onRetry and logger.onRetry when adapter throws and retries remain', async () => {
    const onRetry = vi.fn()
    const logger: AiLogger = { onRetry: vi.fn(), onResponse: vi.fn() }
    const throwingAdapter: IAiAdapter = {
      async complete() { throw new Error('adapter error') },
    }
    await runWithRetry({
      retryDelay: 0,
      adapter: throwingAdapter,
      schema: UserSchema,
      prompt: 'test',
      retries: 3,
      onRetry,
      logger,
    }).catch(() => {})
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(logger.onRetry).toHaveBeenCalledTimes(2)
    expect(logger.onResponse).toHaveBeenCalledTimes(3)
    expect(logger.onResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
  })

  it('lastRaw reflects the last successful adapter response when later attempts throw', async () => {
    let call = 0
    const adapter: IAiAdapter = {
      async complete() {
        call++
        if (call === 1) return '{"name":"John","age":"wrong"}'
        throw new Error('network error')
      },
    }
    const err: AiError = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.lastRaw).toBe('{"name":"John","age":"wrong"}')
    expect(err.lastZodError).toBeDefined()
  })

  it('onRetry is called for both Zod failures and adapter errors across attempts', async () => {
    const onRetry = vi.fn()
    let call = 0
    const adapter: IAiAdapter = {
      async complete() {
        call++
        if (call === 1) return '{"name":"John","age":"wrong"}'
        throw new Error('network error')
      },
    }
    await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry })
      .catch(() => {})
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error))
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error))
  })

  it('truncates long Zod errors in retry prompt to 500 chars', async () => {
    const fields = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`field${i}`, z.number()]))
    const BigSchema = z.object(fields)
    const capturedPrompts: string[] = []
    let call = 0
    const adapter: IAiAdapter = {
      async complete(prompt) {
        capturedPrompts.push(prompt)
        call++
        if (call === 1) {
          const wrong = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`field${i}`, 'wrong']))
          return JSON.stringify(wrong)
        }
        const correct = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`field${i}`, i]))
        return JSON.stringify(correct)
      },
    }
    await runWithRetry({ retryDelay: 0, adapter, schema: BigSchema, prompt: 'test', retries: 3 })

    const retryPrompt = capturedPrompts[1]!
    const afterError = retryPrompt.split('Validation error: ')[1]!
    const zodErrorInPrompt = afterError.split('\n')[0]!
    expect(zodErrorInPrompt.length).toBeLessThanOrEqual(500)
  })
})

describe('runWithRetry adapter error handling', () => {
  class ApiError extends Error {
    constructor(message: string, public readonly status: number) { super(message) }
  }

  function failingAdapter(error: unknown): IAiAdapter & { calls: number } {
    const adapter = {
      calls: 0,
      async complete(): Promise<string> { adapter.calls++; throw error },
    }
    return adapter
  }

  it('exposes the last adapter error as AiError.cause and in the message', async () => {
    const cause = new Error('connect ECONNREFUSED')
    const err: AiError = await runWithRetry({ retryDelay: 0, adapter: failingAdapter(cause), schema: UserSchema, prompt: 'test', retries: 2 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.cause).toBe(cause)
    expect(err.message).toBe('Failed to get valid response after 2 attempts: connect ECONNREFUSED')
  })

  it('exposes the validation error as cause when validation failed last', async () => {
    const err: AiError = await runWithRetry({ retryDelay: 0, adapter: makeAdapter(['{"name":"a","age":"x"}']), schema: UserSchema, prompt: 'test', retries: 1 })
      .catch(e => e)
    expect(err.cause).toBeInstanceOf(Error)
    expect(err.message).toContain('Validation failed: age')
  })

  it.each([400, 401, 403, 404, 422])('does not retry non-retryable client error %i', async status => {
    const onRetry = vi.fn()
    const adapter = failingAdapter(new ApiError('nope', status))
    const err: AiError = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry })
      .catch(e => e)
    expect(adapter.calls).toBe(1)
    expect(onRetry).not.toHaveBeenCalled()
    expect(err).toBeInstanceOf(AiError)
    expect(err.attempts).toBe(1)
    expect((err.cause as ApiError).status).toBe(status)
  })

  it('does not retry an AiResponseError (truncated/refused answer)', async () => {
    const cause = new AiResponseError('cut off', 'test', 'truncated', 'max_tokens')
    const adapter = failingAdapter(cause)
    const err: AiError = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3 })
      .catch(e => e)
    expect(adapter.calls).toBe(1)
    expect(err.cause).toBe(cause)
    expect(cause).toBeInstanceOf(AiResponseError)
    expect(cause.retryable).toBe(false)
  })

  it.each([408, 409, 429, 500, 503])('retries retryable status %i', async status => {
    const adapter = failingAdapter(new ApiError('temporary', status))
    await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 3 }).catch(() => {})
    expect(adapter.calls).toBe(3)
  })
})

describe('runWithRetry argument validation and AiError consistency', () => {
  it.each([0, -1, 1.5, Number.NaN])('rejects retries=%s without calling the adapter', async retries => {
    const complete = vi.fn()
    await expect(runWithRetry({ retryDelay: 0, adapter: { complete }, schema: UserSchema, prompt: 'test', retries }))
      .rejects.toBeInstanceOf(RangeError)
    expect(complete).not.toHaveBeenCalled()
  })

  it('does not report a stale Zod error when the last response failed JSON parsing', async () => {
    const adapter = makeAdapter(['{"name":"John","age":"wrong"}', 'not json {{{'])
    const err: AiError = await runWithRetry({ retryDelay: 0, adapter, schema: UserSchema, prompt: 'test', retries: 2 })
      .catch(e => e)
    expect(err.lastRaw).toBe('not json {{{')
    expect(err.lastZodError).toBeUndefined()
  })
})

describe('runWithRetry backoff', () => {
  class ApiError extends Error {
    constructor(message: string, public readonly status: number) { super(message) }
  }

  function flakyAdapter(failures: number): IAiAdapter & { calls: number, callTimes: number[] } {
    const adapter = {
      calls: 0,
      callTimes: [] as number[],
      async complete(): Promise<string> {
        adapter.calls++
        adapter.callTimes.push(Date.now())
        if (adapter.calls <= failures) throw new ApiError('rate limited', 429)
        return '{"name":"John","age":30}'
      },
    }
    return adapter
  }

  it('waits with an exponentially growing delay between attempts after provider errors', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(1)
    try {
      const adapter = flakyAdapter(2)
      const result = runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3, retryDelay: 100 })
      await vi.advanceTimersByTimeAsync(99)
      expect(adapter.calls).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(adapter.calls).toBe(2)
      await vi.advanceTimersByTimeAsync(199)
      expect(adapter.calls).toBe(2)
      await vi.advanceTimersByTimeAsync(1)
      expect(adapter.calls).toBe(3)
      await expect(result).resolves.toEqual({ name: 'John', age: 30 })
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it('applies jitter: the delay is between half and the full value', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const adapter = flakyAdapter(1)
      const result = runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 2, retryDelay: 100 })
      await vi.advanceTimersByTimeAsync(49)
      expect(adapter.calls).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(adapter.calls).toBe(2)
      await result
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it('does not wait before retrying invalid JSON or validation failures', async () => {
    vi.useFakeTimers()
    try {
      const adapter = makeAdapter(['not json', '{"name":"a","age":"x"}', '{"name":"a","age":1}'])
      await expect(runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3, retryDelay: 10_000 }))
        .resolves.toEqual({ name: 'a', age: 1 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not wait after the last attempt', async () => {
    vi.useFakeTimers()
    try {
      const adapter = flakyAdapter(5)
      const result = runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 1, retryDelay: 10_000 })
      await expect(result).rejects.toBeInstanceOf(AiError)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('rejects retryDelay=%s', async retryDelay => {
    await expect(runWithRetry({ adapter: makeAdapter([]), schema: UserSchema, prompt: 'test', retryDelay }))
      .rejects.toBeInstanceOf(RangeError)
  })
})
