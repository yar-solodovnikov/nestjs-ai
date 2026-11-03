import { describe, it, expect } from 'vitest'
import * as z4 from 'zod/v4'
import type { ZodTypeAny } from 'zod'
import { runWithRetry, AiError } from '../src/structured/retry-engine'
import type { IAiAdapter } from '../src/adapters/adapter.interface'

// zod v4 schemas are structurally different from v3 ZodTypeAny — cast for the test.
const v4 = (schema: unknown): ZodTypeAny => schema as ZodTypeAny

function makeAdapter(responses: string[]): IAiAdapter {
  let i = 0
  return { async complete() { return responses[i++] ?? '' } }
}

describe('zod v4 compatibility', () => {
  it('retries after a v4 validation failure and succeeds', async () => {
    const adapter = makeAdapter(['{"age":"x"}', '{"age":1}'])
    const result = await runWithRetry({ adapter, schema: v4(z4.object({ age: z4.number() })), prompt: 'p' })
    expect(result).toEqual({ age: 1 })
  })

  it('reports v4 validation errors in AiError.lastZodError', async () => {
    const adapter = makeAdapter(['{"age":"x"}'])
    const err: AiError = await runWithRetry({ adapter, schema: v4(z4.object({ age: z4.number() })), prompt: 'p', retries: 1 })
      .catch(e => e)
    expect(err).toBeInstanceOf(AiError)
    expect(err.lastZodError).toContain('age')
  })
})
