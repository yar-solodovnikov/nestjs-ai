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

  it('calls onRetry callback with attempt number', async () => {
    const onRetry = vi.fn()
    const adapter = makeAdapter(['bad', '{"name":"John","age":25}'])
    await runWithRetry({ adapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry })
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
  })
})
