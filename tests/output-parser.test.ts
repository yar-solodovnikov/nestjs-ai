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

  it('rejects an object that is opened but never closed', () => {
    expect(() => parseJson('prefix { ')).toThrow('incomplete JSON')
  })

  it('rejects an array that is opened but never closed', () => {
    expect(() => parseJson('prefix [ ')).toThrow('incomplete JSON')
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

  it('picks the JSON value in a code block, not bracketed text before it', () => {
    expect(parseJson(`${fence}json
// note [x]
{"a":1}
${fence}`)).toEqual({ a: 1 })
  })

  it('ignores JSON in prose after the code block', () => {
    expect(parseJson(`${fence}json
{"a":1}
${fence}
For example {"a":2,"comment":"longer"}`)).toEqual({ a: 1 })
  })

  it('reads a fenced primitive value up to the closing fence', () => {
    expect(parseJson(`${fence}
42
${fence}
See {"x":1}`)).toBe(42)
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

  it('handles escaped quotes inside JSON strings', () => {
    expect(parseJson('Result: {"text":"say \\"hi\\" } ]","n":1} ok')).toEqual({ text: 'say "hi" } ]', n: 1 })
  })

  it('skips a segment with mismatched brackets and finds the next value', () => {
    expect(parseJson('Typo {"a":1] then {"b":2}')).toEqual({ b: 2 })
  })

  it('ignores braces inside JSON strings', () => {
    expect(parseJson('Result: {"text":"use } and ] freely"} done')).toEqual({ text: 'use } and ] freely' })
  })

  it('rejects a truncated object instead of repairing it into partial data', () => {
    expect(() => parseJson('Here: {"name":"John","tags":["a"')).toThrow('incomplete JSON')
  })

  it('does not return a complete nested object from a truncated outer one', () => {
    const raw = '{"name":"root","children":[{"name":"x","children":[]},{"name":"y","chi'
    expect(() => parseJson(raw)).toThrow('incomplete JSON')
  })

  it('rejects a truncated value that follows a complete one', () => {
    expect(() => parseJson('Example: {"a":"string"}. Answer: {"a":"x')).toThrow('incomplete JSON')
  })

  it('skips prose brackets that never close', () => {
    expect(parseJson('Hmm :{ anyway, {"a":1}')).toEqual({ a: 1 })
    expect(parseJson('[see below] and [note: {"a":1}')).toEqual({ a: 1 })
  })

  it('still repairs a complete but malformed object', () => {
    expect(parseJson("Here: {'name':'John', tags:['a',],}")).toEqual({ name: 'John', tags: ['a'] })
  })
})
