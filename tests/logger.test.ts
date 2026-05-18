import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { runWithRetry } from '../src/structured/retry-engine'
import { consoleAiLogger } from '../src/ai.logger'
import type { IAiAdapter } from '../src/adapters/adapter.interface'
import type { AiLogger } from '../src/ai.logger'

const Schema = z.object({ value: z.number() })

function makeAdapter(responses: string[]): IAiAdapter {
  let i = 0
  return { async complete() { return responses[i++] ?? '' } }
}

describe('AiLogger interface via runWithRetry', () => {
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

describe('consoleAiLogger', () => {
  it('onRequest logs attempt number and truncated prompt', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleAiLogger.onRequest!({ prompt: 'hello world', attempt: 1 })
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('attempt 1'))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('hello world'))
    spy.mockRestore()
  })

  it('onRequest truncates prompts longer than 80 chars', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const longPrompt = 'a'.repeat(120)
    consoleAiLogger.onRequest!({ prompt: longPrompt, attempt: 1 })
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('…')
    expect(output).not.toContain('a'.repeat(81))
    spy.mockRestore()
  })

  it('onRequest does not add ellipsis for short prompts', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleAiLogger.onRequest!({ prompt: 'short', attempt: 2 })
    expect(spy.mock.calls[0]![0]).not.toContain('…')
    spy.mockRestore()
  })

  it('onResponse logs success message', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleAiLogger.onResponse!({ prompt: '', attempt: 1, durationMs: 150, success: true })
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('succeeded'))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('150ms'))
    spy.mockRestore()
  })

  it('onResponse warns on failure with error message', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleAiLogger.onResponse!({ prompt: '', attempt: 2, durationMs: 200, success: false, error: 'bad schema' })
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('failed'))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('bad schema'))
    spy.mockRestore()
  })

  it('onRetry warns with attempt number and error message', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleAiLogger.onRetry!(3, new Error('validation failed'))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('retry 3'))
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('validation failed'))
    spy.mockRestore()
  })
})
