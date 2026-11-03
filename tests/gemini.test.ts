import { describe, it, expect, vi } from 'vitest'
import { geminiAdapter } from '../src/adapters/gemini.adapter'
import { AiResponseError } from '../src/adapters/response-error'

function clientReturning(response: Record<string, unknown>) {
  const generateContent = vi.fn().mockResolvedValue({ response })
  return { getGenerativeModel: vi.fn().mockReturnValue({ generateContent }) }
}

describe('geminiAdapter', () => {
  it('calls getGenerativeModel and returns text', async () => {
    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: { text: () => 'hello' },
      }),
    }
    const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) }
    const adapter = geminiAdapter(mockClient)
    expect(await adapter.complete('test prompt')).toBe('hello')
    expect(mockClient.getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.0-flash' })
    )
  })

  it('uses maxTokens from adapter defaults when not overridden per call', async () => {
    const mockModel = { generateContent: vi.fn().mockResolvedValue({ response: { text: () => 'ok' } }) }
    const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) }
    await geminiAdapter(mockClient, { maxTokens: 50 }).complete('test')
    expect(mockClient.getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ generationConfig: expect.objectContaining({ maxOutputTokens: 50 }) })
    )
  })

  it('throws if response text is empty', async () => {
    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({ response: { text: () => '' } }),
    }
    const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) }
    await expect(geminiAdapter(mockClient).complete('test')).rejects.toThrow('empty response')
  })

  it('throws a non-retryable AiResponseError when the answer hit the token limit', async () => {
    const client = clientReturning({ candidates: [{ finishReason: 'MAX_TOKENS' }], text: () => '{"a":[1,' })
    const err = await geminiAdapter(client).complete('test').catch(e => e)
    expect(err).toBeInstanceOf(AiResponseError)
    expect(err).toMatchObject({ provider: 'gemini', reason: 'truncated', retryable: false })
  })

  it('reports a blocked prompt without calling text()', async () => {
    const text = vi.fn(() => { throw new Error('Text not available. Response was blocked') })
    const client = clientReturning({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [], text })
    const err = await geminiAdapter(client).complete('test').catch(e => e)
    expect(err).toMatchObject({ reason: 'blocked', detail: 'SAFETY' })
    expect(text).not.toHaveBeenCalled()
  })

  it.each(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT'])('reports a response blocked with finishReason %s', async reason => {
    const client = clientReturning({ candidates: [{ finishReason: reason }], text: () => '' })
    const err = await geminiAdapter(client).complete('test').catch(e => e)
    expect(err).toMatchObject({ reason: 'blocked', detail: reason })
  })

  it('returns text for finishReason STOP', async () => {
    const client = clientReturning({ candidates: [{ finishReason: 'STOP' }], text: () => 'ok' })
    expect(await geminiAdapter(client).complete('test')).toBe('ok')
  })
})
