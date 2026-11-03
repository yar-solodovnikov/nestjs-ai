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
      expect.objectContaining({ model: 'gemini-3.6-flash' })
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

  it('does not lower the temperature by default', async () => {
    const client = clientReturning({ candidates: [{ finishReason: 'STOP' }], text: () => 'ok' })
    await geminiAdapter(client).complete('test')
    expect(client.getGenerativeModel.mock.calls[0]![0].generationConfig.temperature).toBeUndefined()
  })

  it('passes an explicit temperature', async () => {
    const client = clientReturning({ candidates: [{ finishReason: 'STOP' }], text: () => 'ok' })
    await geminiAdapter(client, { temperature: 0.4 }).complete('test')
    expect(client.getGenerativeModel.mock.calls[0]![0].generationConfig.temperature).toBe(0.4)
  })
})

function genAiClientReturning(response: Record<string, unknown>) {
  return { models: { generateContent: vi.fn().mockResolvedValue(response) } }
}

describe('geminiAdapter with @google/genai', () => {
  it('calls models.generateContent and returns the text property', async () => {
    const client = genAiClientReturning({ candidates: [{ finishReason: 'STOP' }], text: 'hello' })
    expect(await geminiAdapter(client).complete('test prompt')).toBe('hello')
    expect(client.models.generateContent).toHaveBeenCalledWith({
      model: 'gemini-3.6-flash',
      contents: 'test prompt',
      config: {},
    })
  })

  it('maps model, temperature and maxTokens into the request config', async () => {
    const client = genAiClientReturning({ candidates: [{ finishReason: 'STOP' }], text: 'ok' })
    await geminiAdapter(client, { model: 'gemini-3.6-pro', maxTokens: 50 }).complete('test', { temperature: 0.4 })
    expect(client.models.generateContent).toHaveBeenCalledWith({
      model: 'gemini-3.6-pro',
      contents: 'test',
      config: { temperature: 0.4, maxOutputTokens: 50 },
    })
  })

  it('throws if the response has no text', async () => {
    const client = genAiClientReturning({ candidates: [{ finishReason: 'STOP' }], text: undefined })
    await expect(geminiAdapter(client).complete('test')).rejects.toThrow('empty response')
  })

  it('throws a non-retryable AiResponseError when the answer hit the token limit', async () => {
    const client = genAiClientReturning({ candidates: [{ finishReason: 'MAX_TOKENS' }], text: '{"a":[1,' })
    const err = await geminiAdapter(client).complete('test').catch(e => e)
    expect(err).toBeInstanceOf(AiResponseError)
    expect(err).toMatchObject({ provider: 'gemini', reason: 'truncated', retryable: false })
  })

  it('reports a blocked prompt', async () => {
    const client = genAiClientReturning({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' }, text: undefined })
    const err = await geminiAdapter(client).complete('test').catch(e => e)
    expect(err).toMatchObject({ reason: 'blocked', detail: 'PROHIBITED_CONTENT' })
  })

  it('reports a blocked response', async () => {
    const client = genAiClientReturning({ candidates: [{ finishReason: 'SAFETY' }], text: undefined })
    const err = await geminiAdapter(client).complete('test').catch(e => e)
    expect(err).toMatchObject({ reason: 'blocked', detail: 'SAFETY' })
  })
})

describe('geminiAdapter client detection', () => {
  it('rejects an object that is not a Gemini client', () => {
    expect(() => geminiAdapter({})).toThrow(TypeError)
  })

  it('rejects the class instead of an instance', () => {
    class GoogleGenAI {}
    expect(() => geminiAdapter(GoogleGenAI)).toThrow('client instance')
  })
})
