import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('openai', () => ({
  OpenAI: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: 'ollama response' } }],
  })
})

describe('ollamaAdapter', () => {
  it('lazily loads openai via dynamic import and delegates to openaiAdapter', async () => {
    const { ollamaAdapter } = await import('../src/adapters/ollama.adapter')
    const adapter = ollamaAdapter({ model: 'llama3.2' })
    const result = await adapter.complete('test prompt')
    expect(result).toBe('ollama response')
  })

  // Bug fix: ollamaAdapter previously used require() which breaks in ESM
  // Now uses dynamic import — verify OpenAI client is created only once (cached)
  it('caches the internal adapter — OpenAI client created only once across sequential calls', async () => {
    const { ollamaAdapter } = await import('../src/adapters/ollama.adapter')
    const { OpenAI } = await import('openai')

    const adapter = ollamaAdapter({ model: 'llama3.2' })
    await adapter.complete('first call')
    await adapter.complete('second call')

    expect(OpenAI).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  // Bug fix: race condition — two concurrent calls must not create two OpenAI instances
  it('concurrent calls create only one OpenAI instance', async () => {
    const { ollamaAdapter } = await import('../src/adapters/ollama.adapter')
    const { OpenAI } = await import('openai')

    const adapter = ollamaAdapter({ model: 'llama3.2' })

    // Both calls start before either resolves — this is the race condition scenario
    const [r1, r2] = await Promise.all([
      adapter.complete('concurrent call 1'),
      adapter.complete('concurrent call 2'),
    ])

    expect(r1).toBe('ollama response')
    expect(r2).toBe('ollama response')
    expect(OpenAI).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('passes custom model to openai client', async () => {
    const { ollamaAdapter } = await import('../src/adapters/ollama.adapter')
    const adapter = ollamaAdapter({ model: 'mistral' })
    await adapter.complete('test')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mistral' })
    )
  })

  it('passes maxTokens from adapter options to the request', async () => {
    const { ollamaAdapter } = await import('../src/adapters/ollama.adapter')
    await ollamaAdapter({ maxTokens: 64 }).complete('test')
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 64 }))
  })

  it('passes the reasoning option through to the OpenAI adapter', async () => {
    const { ollamaAdapter } = await import('../src/adapters/ollama.adapter')
    await ollamaAdapter({ model: 'qwen3', reasoning: true, maxTokens: 64 }).complete('test')
    const request = mockCreate.mock.calls[0]![0]
    expect(request).toMatchObject({ model: 'qwen3', max_completion_tokens: 64 })
    expect(request).not.toHaveProperty('temperature')
  })
})
