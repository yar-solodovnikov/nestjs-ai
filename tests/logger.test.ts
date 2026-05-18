import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { runWithRetry } from '../src/structured/retry-engine'
import type { IAiAdapter } from '../src/adapters/adapter.interface'
import type { AiLogger } from '../src/ai.logger'

const Schema = z.object({ value: z.number() })

function makeAdapter(responses: string[]): IAiAdapter {
  let i = 0
  return { async complete() { return responses[i++] ?? '' } }
}

describe('AiLogger', () => {
  it('calls onRequest before each attempt', async () => {
    const logger: AiLogger = { onRequest: vi.fn(), onResponse: vi.fn() }
    const adapter = makeAdapter(['{"value":42}'])
    await runWithRetry({ adapter, schema: Schema, prompt: 'test', logger })
    expect(logger.onRequest).toHaveBeenCalledOnce()
    expect(logger.onRequest).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }))
  })

  it('calls onResponse with success: true on valid result', async () => {
    const logger: AiLogger = { onResponse: vi.fn() }
    await runWithRetry({ adapter: makeAdapter(['{"value":42}']), schema: Schema, prompt: 'test', logger })
    expect(logger.onResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, attempt: 1 })
    )
  })

  it('calls onRetry and onResponse with success: false on failure then success', async () => {
    const logger: AiLogger = { onResponse: vi.fn(), onRetry: vi.fn() }
    await runWithRetry({
      adapter: makeAdapter(['bad json', '{"value":42}']),
      schema: Schema, prompt: 'test', retries: 3, logger,
    })
    expect(logger.onRetry).toHaveBeenCalledOnce()
    expect(logger.onResponse).toHaveBeenCalledTimes(2)
    expect(logger.onResponse).toHaveBeenNthCalledWith(1, expect.objectContaining({ success: false }))
    expect(logger.onResponse).toHaveBeenNthCalledWith(2, expect.objectContaining({ success: true }))
  })
})
