import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { runWithRetry, AiError } from '../src/structured/retry-engine'
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
    const result = await runWithRetry({ adapter, schema: UserSchema, prompt: 'test' })
    expect(result).toEqual({ name: 'John', age: 25 })
  })

  it('retries after invalid JSON and succeeds', async () => {
    const adapter = makeAdapter(['not json at all', '{"name":"John","age":25}'])
    const result = await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3 })
    expect(result).toEqual({ name: 'John', age: 25 })
  })

  it('retries after Zod validation failure and succeeds', async () => {
    const adapter = makeAdapter(['{"name":"John","age":"twenty"}', '{"name":"John","age":25}'])
    const result = await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3 })
    expect(result).toEqual({ name: 'John', age: 25 })
  })

  it('throws AiError after exhausting retries', async () => {
    const adapter = makeAdapter(['bad', 'bad', 'bad'])
    await expect(
      runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3 })
    ).rejects.toBeInstanceOf(AiError)
  })

  it('AiError contains attempt count and last raw response', async () => {
    const adapter = makeAdapter(['bad1', 'bad2', 'bad3'])
    const err = await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.attempts).toBe(3)
    expect(err.lastRaw).toBe('bad3')
  })

  it('calls onRetry callback with attempt number', async () => {
    const onRetry = vi.fn()
    const adapter = makeAdapter(['bad', '{"name":"John","age":25}'])
    await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry })
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
  })

  it('does not call onRetry on the last failed attempt', async () => {
    const onRetry = vi.fn()
    const adapter = makeAdapter(['bad', 'bad', 'bad'])
    await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry })
      .catch(() => {})
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('does not call onRetry when retries=1', async () => {
    const onRetry = vi.fn()
    const adapter = makeAdapter(['bad'])
    await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 1, onRetry })
      .catch(() => {})
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('AiError.lastZodError is undefined when adapter always throws (Zod never ran)', async () => {
    const throwingAdapter: IAiAdapter = {
      async complete() { throw new Error('network error') },
    }
    const err: AiError = await runWithRetry({ adapter: throwingAdapter, schema: UserSchema, prompt: 'test', retries: 3 })
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
    const err: AiError = await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.lastZodError).toBeDefined()
    expect(err.lastZodError).toContain('age')
  })

  it('AiError instanceof check works and name is "AiError"', async () => {
    const adapter = makeAdapter(['bad'])
    const err = await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 1 })
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
    const err = await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 1 })
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
    const err: AiError = await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3 })
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
    await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry })
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
    await runWithRetry({ adapter, schema: BigSchema, prompt: 'test', retries: 3 })

    const retryPrompt = capturedPrompts[1]!
    const afterError = retryPrompt.split('Validation error: ')[1]!
    const zodErrorInPrompt = afterError.split('\n')[0]!
    expect(zodErrorInPrompt.length).toBeLessThanOrEqual(500)
  })
})
