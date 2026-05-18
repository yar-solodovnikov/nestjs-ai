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

  // Bug fix: ZodOptional is T | undefined (field may be omitted), NOT T | null
  it('describes optional fields as omittable, not null', () => {
    const schema = z.object({ bio: z.string().optional() })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('optional')
    expect(prompt).not.toContain('"bio": "string" | null')
  })

  // ZodNullable is T | null — semantically distinct from optional
  it('describes nullable fields as | null', () => {
    const schema = z.object({ bio: z.string().nullable() })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"bio": "string" | null')
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

  it('describes null fields', () => {
    const schema = z.object({ deleted: z.null() })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"deleted": null')
  })

  it('describes literal fields', () => {
    const schema = z.object({ type: z.literal('user') })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"type": "user"')
  })

  it('describes numeric literal fields', () => {
    const schema = z.object({ version: z.literal(1) })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"version": 1')
  })

  it('describes union fields', () => {
    const schema = z.object({ id: z.union([z.string(), z.number()]) })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"string" | number')
  })

  it('describes fields with defaults as their inner type', () => {
    const schema = z.object({ lang: z.string().default('en') })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"lang": "string"')
  })

  // Branch: unrecognized schema type falls back to 'unknown'
  it('returns "unknown" for unsupported schema types like ZodLazy', () => {
    // ZodLazy is not handled — used for recursive schemas
    const schema = z.object({ ref: z.lazy(() => z.string()) })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"ref": unknown')
  })

  it('starts with the instruction line', () => {
    const schema = z.object({ x: z.string() })
    expect(zodToPrompt(schema)).toMatch(/^Return ONLY valid JSON/)
  })
})
