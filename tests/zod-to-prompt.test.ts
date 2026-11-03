import { describe, it, expect } from 'vitest'
import { z, type ZodTypeAny } from 'zod'
import * as z4 from 'zod/v4'
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

  it('describes refined and transformed fields by their input type', () => {
    const schema = z.object({
      name: z.string().refine(s => s.length > 0),
      count: z.number().transform(String),
      trimmed: z.preprocess(v => v, z.string()),
    })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"name": "string"')
    expect(prompt).toContain('"count": number')
    expect(prompt).toContain('"trimmed": "string"')
  })

  it('describes records, tuples and dates', () => {
    const schema = z.object({ scores: z.record(z.number()), pair: z.tuple([z.string(), z.number()]), at: z.date() })
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"scores": { [key: string]: number }')
    expect(prompt).toContain('"pair": ["string", number]')
    expect(prompt).toContain('"at": "ISO 8601 date string"')
  })

  it('describes discriminated unions', () => {
    const schema = z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('a'), a: z.string() }),
      z.object({ kind: z.literal('b'), b: z.number() }),
    ])
    const prompt = zodToPrompt(schema)
    expect(prompt).toContain('"kind": "a"')
    expect(prompt).toContain('"kind": "b"')
  })

  it('describes native enums without numeric reverse mappings', () => {
    enum Color { Red, Green }
    const prompt = zodToPrompt(z.object({ c: z.nativeEnum(Color), s: z.nativeEnum({ A: 'a', B: 'b' } as const) }))
    expect(prompt).toContain('"c": 0 | 1')
    expect(prompt).toContain('"s": "a" | "b"')
  })

  it('includes .describe() text', () => {
    const prompt = zodToPrompt(z.object({ price: z.number().describe('price in USD') }))
    expect(prompt).toContain('"price": number (price in USD)')
  })

  it('describes zod v4 schemas', () => {
    const schema = z4.object({
      name: z4.string(),
      tags: z4.array(z4.string()),
      role: z4.enum(['admin', 'user']),
      kind: z4.literal('x'),
      bio: z4.string().optional(),
      note: z4.string().nullable(),
      n: z4.number().transform(String),
    })
    const prompt = zodToPrompt(schema as unknown as ZodTypeAny)
    expect(prompt).toContain('"name": "string"')
    expect(prompt).toContain('"tags": ["string"]')
    expect(prompt).toContain('"role": "admin" | "user"')
    expect(prompt).toContain('"kind": "x"')
    expect(prompt).toContain('"bio": "string" (optional, may be omitted)')
    expect(prompt).toContain('"note": "string" | null')
    expect(prompt).toContain('"n": number')
  })
})
