import { describe, it, expect, vi } from 'vitest'
import { geminiAdapter } from '../src/adapters/gemini.adapter'

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

  it('throws if response text is empty', async () => {
    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({ response: { text: () => '' } }),
    }
    const mockClient = { getGenerativeModel: vi.fn().mockReturnValue(mockModel) }
    await expect(geminiAdapter(mockClient).complete('test')).rejects.toThrow('empty response')
  })
})
