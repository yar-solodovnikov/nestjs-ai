import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import type { IAiAdapter } from '../src/adapters/adapter.interface'
import type { AiLogger } from '../src/ai.logger'

// Mock output-parser before importing retry-engine so the mock is in place at module load time
vi.mock('../src/structured/output-parser', () => ({
  parseJson: vi.fn(() => { throw new Error('JSON parse failed') }),
}))

const { runWithRetry, AiError } = await import('../src/structured/retry-engine')
const { parseJson } = await import('../src/structured/output-parser')

const UserSchema = z.object({ name: z.string(), age: z.number() })

const okAdapter: IAiAdapter = { async complete() { return '{"name":"John","age":25}' } }

describe('runWithRetry — parse error path', () => {
  it('throws AiError when parseJson always throws', async () => {
    const err = await runWithRetry({ adapter: okAdapter, schema: UserSchema, prompt: 'test', retries: 1 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.lastZodError).toBeUndefined()
  })

  it('calls onRetry when parseJson throws and retries remain', async () => {
    const onRetry = vi.fn()
    const logger: AiLogger = { onRetry: vi.fn(), onResponse: vi.fn() }
    await runWithRetry({ adapter: okAdapter, schema: UserSchema, prompt: 'test', retries: 3, onRetry, logger })
      .catch(() => {})
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(logger.onRetry).toHaveBeenCalledTimes(2)
    expect(logger.onResponse).toHaveBeenCalledTimes(3)
  })

  it('lastRaw contains the adapter response even when parseJson throws', async () => {
    const err: InstanceType<typeof AiError> = await runWithRetry({ adapter: okAdapter, schema: UserSchema, prompt: 'test', retries: 1 })
      .catch(e => e)
    expect(err.lastRaw).toBe('{"name":"John","age":25}')
  })

  it('wraps non-Error thrown from parseJson into an Error', async () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    vi.mocked(parseJson).mockImplementationOnce(() => { throw 'string parse error' as unknown })
    const err = await runWithRetry({ adapter: okAdapter, schema: UserSchema, prompt: 'test', retries: 1 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.lastZodError).toBeUndefined()
  })
})
