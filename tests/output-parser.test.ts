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

  // Branch: opening brace found but no closing brace — slices from '{' to end
  it('extracts from opening brace when no closing brace exists', () => {
    // '{ ' → jsonrepair → '{}' → {}
    const result = parseJson('prefix { ')
    expect(result).toEqual({})
  })

  // Branch: opening bracket found but no closing bracket
  it('extracts from opening bracket when no closing bracket exists', () => {
    const result = parseJson('prefix [ ')
    expect(result).toEqual([])
  })

  // Branch: no brace/bracket found — full text passed to jsonrepair
  it('passes entire text to jsonrepair when no brace or bracket is found', () => {
    // jsonrepair repairs "true" → valid JSON
    expect(parseJson('true')).toBe(true)
  })

  const fence = '```'

  it('strips code blocks with any language tag', () => {
    expect(parseJson(`${fence}js\n{"a":1}\n${fence}`)).toEqual({ a: 1 })
    expect(parseJson(`${fence}jsonc\n{"a":1}\n${fence}`)).toEqual({ a: 1 })
    expect(parseJson(`${fence}JSON\n{"a":1}\n${fence}`)).toEqual({ a: 1 })
  })

  it('keeps backtick fences that appear inside JSON strings', () => {
    const json = JSON.stringify({ code: `${fence}x${fence}` })
    expect(parseJson(`${fence}json\n${json}\n${fence}`)).toEqual({ code: `${fence}x${fence}` })
  })

  it('parses a fenced primitive value', () => {
    expect(parseJson(`${fence}\n"hello"\n${fence}`)).toBe('hello')
    expect(parseJson(`${fence}true${fence}`)).toBe(true)
  })

  it('ignores bracketed prose before the JSON', () => {
    expect(parseJson('[Note] here is the result: {"a":1}')).toEqual({ a: 1 })
  })

  it('ignores closing braces in trailing prose', () => {
    expect(parseJson('Answer {"a":1}. Hope that helps :}')).toEqual({ a: 1 })
  })

  it('ignores braces inside JSON strings', () => {
    expect(parseJson('Result: {"text":"use } and ] freely"} done')).toEqual({ text: 'use } and ] freely' })
  })

  it('still repairs a truncated object', () => {
    expect(parseJson('Here: {"name":"John","tags":["a"')).toEqual({ name: 'John', tags: ['a'] })
  })
})
