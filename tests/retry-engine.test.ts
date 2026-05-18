import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { runWithRetry, AiError } from '../src/structured/retry-engine'
import type { IAiAdapter } from '../src/adapters/adapter.interface'

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

  // Bug fix: onRetry must NOT be called on the last attempt (there is no next retry)
  it('does not call onRetry on the last failed attempt', async () => {
    const onRetry = vi.fn()
    const adapter = makeAdapter(['bad', 'bad', 'bad'])
    await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry })
      .catch(() => {})
    // 3 attempts, retries=3 → onRetry should be called only after attempts 1 and 2
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  // Bug fix: onRetry must NOT be called when retries=1 (single attempt, no retry possible)
  it('does not call onRetry when retries=1', async () => {
    const onRetry = vi.fn()
    const adapter = makeAdapter(['bad'])
    await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 1, onRetry })
      .catch(() => {})
    expect(onRetry).not.toHaveBeenCalled()
  })
})
