import { describe, it, expect } from 'vitest'
import { parseJson } from '../src/structured/output-parser'

describe('parseJson', () => {
  it('parses clean JSON object', () => {
    expect(parseJson('{"name":"John","age":25}')).toEqual({ name: 'John', age: 25 })
  })

  it('strips markdown code block', () => {
    expect(parseJson('```json\n{"name":"John"}\n```')).toEqual({ name: 'John' })
  })

  it('strips markdown code block without language tag', () => {
    expect(parseJson('```\n{"name":"John"}\n```')).toEqual({ name: 'John' })
  })

  it('extracts JSON from surrounding text', () => {
    expect(parseJson('Here is the result: {"name":"John"} done')).toEqual({ name: 'John' })
  })

  it('repairs trailing comma', () => {
    expect(parseJson('{"name":"John","age":25,}')).toEqual({ name: 'John', age: 25 })
  })

  it('repairs unquoted keys', () => {
    const result = parseJson('{name:"John"}') as Record<string, unknown>
    expect(result.name).toBe('John')
  })

  it('parses JSON array', () => {
    expect(parseJson('[1,2,3]')).toEqual([1, 2, 3])
  })
})
