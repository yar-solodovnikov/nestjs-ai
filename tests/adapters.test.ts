import { describe, it, expect, vi } from 'vitest'
import { openaiAdapter } from '../src/adapters/openai.adapter'
import { anthropicAdapter } from '../src/adapters/anthropic.adapter'
import { AiResponseError } from '../src/adapters/response-error'

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

  it.each(['o1', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5-mini', 'gpt-5.1', 'gpt-6-luna', 'gpt-6.1-terra', 'openai/o3'])(
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

  it('uses maxTokens from adapter defaults when not overridden per call', async () => {
    const { create, client } = mockOpenAi()
    await openaiAdapter(client, { maxTokens: 50 }).complete('test')
    expect(create.mock.calls[0]![0]).toMatchObject({ max_tokens: 50 })
    await openaiAdapter(client, { maxTokens: 50 }).complete('test', { maxTokens: 10 })
    expect(create.mock.calls[1]![0]).toMatchObject({ max_tokens: 10 })
  })

  it.each(['gpt-4o', 'gpt-4.1-mini', 'llama3.2', 'gpt-oss:20b'])('treats %s as a regular chat model', async model => {
    const { create, client } = mockOpenAi()
    await openaiAdapter(client).complete('test', { model, maxTokens: 100 })
    expect(create.mock.calls[0]![0]).toMatchObject({ temperature: 0, max_tokens: 100 })
  })

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

  it('throws a non-retryable AiResponseError when the answer was cut off by max_tokens', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: '{"items":[1,2' }],
    })
    const err = await anthropicAdapter({ messages: { create } }).complete('test').catch(e => e)
    expect(err).toBeInstanceOf(AiResponseError)
    expect(err).toMatchObject({ provider: 'anthropic', reason: 'truncated', retryable: false })
  })

  it('throws AiResponseError with the refusal category on stop_reason refusal', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber', explanation: '...' },
      content: [],
    })
    const err = await anthropicAdapter({ messages: { create } }).complete('test').catch(e => e)
    expect(err).toBeInstanceOf(AiResponseError)
    expect(err).toMatchObject({ reason: 'refusal', detail: 'cyber' })
    expect(err.message).toContain('cyber')
  })

  it('defaults to claude-opus-5-5 with max_tokens 16000', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    await anthropicAdapter({ messages: { create } }).complete('test')
    expect(create.mock.calls[0]![0]).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000 })
  })

  describe('refusal fallback', () => {
    const ok = { content: [{ type: 'text', text: 'ok' }] }

    function firstPartyClient() {
      return {
        messages: { create: vi.fn().mockResolvedValue(ok) },
        beta: { messages: { create: vi.fn().mockResolvedValue(ok) } },
      }
    }

    it('uses the beta endpoint with fallbacks "default" for supported models', async () => {
      const client = firstPartyClient()
      await anthropicAdapter(client).complete('test')
      expect(client.messages.create).not.toHaveBeenCalled()
      expect(client.beta.messages.create).toHaveBeenCalledWith(expect.objectContaining({
        model: 'claude-opus-5-5',
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      }))
    })

    it('ignores fallback blocks in the content', async () => {
      const client = firstPartyClient()
      client.beta.messages.create.mockResolvedValue({
        stop_reason: 'end_turn',
        content: [
          { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } },
          { type: 'text', text: 'rescued' },
        ],
      })
      expect(await anthropicAdapter(client).complete('test')).toBe('rescued')
    })

    it('can be disabled', async () => {
      const client = firstPartyClient()
      await anthropicAdapter(client, { refusalFallback: false }).complete('test')
      expect(client.beta.messages.create).not.toHaveBeenCalled()
      expect(client.messages.create.mock.calls[0]![0]).not.toHaveProperty('fallbacks')
    })

    it('is not used for models without fallback support', async () => {
      const client = firstPartyClient()
      await anthropicAdapter(client, { model: 'claude-haiku-5-5' }).complete('test')
      expect(client.beta.messages.create).not.toHaveBeenCalled()
      expect(client.messages.create).toHaveBeenCalledOnce()
    })

    it('is not used for Bedrock, Vertex or Foundry clients', async () => {
      for (const name of ['AnthropicBedrockMantle', 'AnthropicVertex', 'AnthropicFoundry']) {
        const client = Object.assign(Object.create({ constructor: { name } }), firstPartyClient())
        await anthropicAdapter(client).complete('test')
        expect(client.beta.messages.create).not.toHaveBeenCalled()
        expect(client.messages.create).toHaveBeenCalledOnce()
      }
    })
  })

  it('never sends temperature, even when one is configured', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
    const adapter = anthropicAdapter({ messages: { create } }, { temperature: 0.2 })
    await adapter.complete('test', { temperature: 0.7 })
    expect(create.mock.calls[0]![0]).not.toHaveProperty('temperature')
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
