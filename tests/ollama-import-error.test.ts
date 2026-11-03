import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ loadError: null as unknown, created: 0 }))

vi.mock('openai', () => {
  const OpenAI = vi.fn().mockImplementation(() => {
    state.created++
    return { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: 'ok' } }] }) } } }
  })
  // A throwing getter simulates a failed module load inside the adapter's try block
  // (vitest wraps errors thrown directly from a mock factory).
  return {
    get OpenAI() {
      if (state.loadError) throw state.loadError
      return OpenAI
    },
  }
})

function codedError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code })
}

beforeEach(() => {
  vi.resetModules()
  state.loadError = null
  state.created = 0
})

describe('ollamaAdapter import errors', () => {
  it('reports a missing openai package with an install hint', async () => {
    state.loadError = codedError("Cannot find package 'openai'", 'ERR_MODULE_NOT_FOUND')
    const { ollamaAdapter } = await import('../src/adapters/ollama.adapter')
    await expect(ollamaAdapter().complete('p')).rejects.toThrow('npm install openai')
  })

  it('rethrows other load errors unchanged', async () => {
    state.loadError = new Error('SyntaxError in openai')
    const { ollamaAdapter } = await import('../src/adapters/ollama.adapter')
    await expect(ollamaAdapter().complete('p')).rejects.toThrow('SyntaxError in openai')
  })

  it('does not cache a failed initialization', async () => {
    const { ollamaAdapter } = await import('../src/adapters/ollama.adapter')
    const adapter = ollamaAdapter()
    state.created = 0
    // Make the first client construction fail, the second succeed.
    const { OpenAI } = await import('openai')
    vi.mocked(OpenAI).mockImplementationOnce(() => { throw new Error('boom') })
    await expect(adapter.complete('p')).rejects.toThrow('boom')
    await expect(adapter.complete('p')).resolves.toBe('ok')
  })
})
