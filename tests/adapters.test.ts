import { describe, it, expect, vi } from 'vitest'
import { openaiAdapter } from '../src/adapters/openai.adapter'
import { anthropicAdapter } from '../src/adapters/anthropic.adapter'

describe('openaiAdapter', () => {
  it('calls client.chat.completions.create and returns content', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'hello' } }],
          }),
        },
      },
    }
    const adapter = openaiAdapter(mockClient)
    expect(await adapter.complete('test prompt')).toBe('hello')
    expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [{ role: 'user', content: 'test prompt' }] })
    )
  })

  it('throws if response content is empty', async () => {
    const mockClient = {
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [] }) } },
    }
    await expect(openaiAdapter(mockClient).complete('test')).rejects.toThrow('empty response')
  })

  it('passes model and temperature overrides to the client', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
    })
    const mockClient = { chat: { completions: { create } } }
    await openaiAdapter(mockClient).complete('test', { model: 'gpt-4o', temperature: 0.5 })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o', temperature: 0.5 }))
  })

  function mockOpenAi() {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: 'ok' } }] })
    return { create, client: { chat: { completions: { create } } } }
  }

  it('sends temperature 0 and max_tokens for regular chat models', async () => {
    const { create, client } = mockOpenAi()
    await openaiAdapter(client).complete('test', { model: 'gpt-4o', maxTokens: 100 })
    const request = create.mock.calls[0]![0]
    expect(request).toMatchObject({ temperature: 0, max_tokens: 100 })
    expect(request).not.toHaveProperty('max_completion_tokens')
  })

  it('omits max_tokens when maxTokens is not set', async () => {
    const { create, client } = mockOpenAi()
    await openaiAdapter(client).complete('test')
    expect(create.mock.calls[0]![0]).not.toHaveProperty('max_tokens')
  })

  it.each(['o1', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5-mini', 'gpt-5.1', 'openai/o3'])(
    'uses max_completion_tokens and no default temperature for reasoning model %s',
    async model => {
      const { create, client } = mockOpenAi()
      await openaiAdapter(client).complete('test', { model, maxTokens: 100 })
      const request = create.mock.calls[0]![0]
      expect(request).toMatchObject({ max_completion_tokens: 100 })
      expect(request).not.toHaveProperty('max_tokens')
      expect(request).not.toHaveProperty('temperature')
    },
  )

  it('treats gpt-5-chat models as regular chat models', async () => {
    const { create, client } = mockOpenAi()
    await openaiAdapter(client).complete('test', { model: 'gpt-5-chat-latest', maxTokens: 100 })
    expect(create.mock.calls[0]![0]).toMatchObject({ temperature: 0, max_tokens: 100 })
  })

  it('still sends an explicit temperature to reasoning models', async () => {
    const { create, client } = mockOpenAi()
    await openaiAdapter(client, { model: 'o3', temperature: 1 }).complete('test')
    expect(create.mock.calls[0]![0]).toMatchObject({ temperature: 1 })
  })
})

describe('anthropicAdapter', () => {
  it('calls client.messages.create and returns text', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'hello' }],
        }),
      },
    }
    const adapter = anthropicAdapter(mockClient)
    expect(await adapter.complete('test prompt')).toBe('hello')
  })

  it('throws if response content is empty', async () => {
    const mockClient = {
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
    }
    await expect(anthropicAdapter(mockClient).complete('test')).rejects.toThrow('empty response')
  })

  it('throws if response block is not text type', async () => {
    const mockClient = {
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'tool_use' }] }) },
    }
    await expect(anthropicAdapter(mockClient).complete('test')).rejects.toThrow('empty response')
  })

  it('skips leading thinking blocks and joins all text blocks', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'thinking', thinking: 'let me think' },
            { type: 'text', text: '{"a":' },
            { type: 'text', text: '1}' },
          ],
        }),
      },
    }
    expect(await anthropicAdapter(mockClient).complete('test')).toBe('{"a":1}')
  })
})
