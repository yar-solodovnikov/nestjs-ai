import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { zodToPrompt } from '../src/structured/zod-to-prompt'

describe('zodToPrompt', () => {
  it('describes a flat object', () => {
    const schema = z.object({ name: z.string(), age: z.number() })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"name": "string"')
    expect(prompt).toContain('"age": number')
  })

  it('describes nested objects', () => {
    const schema = z.object({ user: z.object({ id: z.number() }) })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"user"')
    expect(prompt).toContain('"id": number')
  })

  it('describes arrays', () => {
    const schema = z.object({ tags: z.array(z.string()) })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"tags": ["string"]')
  })

  it('describes optional fields', () => {
    const schema = z.object({ bio: z.string().optional() })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('null')
  })

  it('describes enum fields', () => {
    const schema = z.object({ role: z.enum(['admin', 'user']) })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"admin"')
    expect(prompt).toContain('"user"')
  })

  it('describes boolean fields', () => {
    const schema = z.object({ active: z.boolean() })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"active": boolean')
  })

  it('starts with the instruction line', () => {
    const schema = z.object({ x: z.string() })
    expect(zodToPrompt(schema)).toMatch(/^Return ONLY valid JSON/)
  })
})
