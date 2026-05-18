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
})
