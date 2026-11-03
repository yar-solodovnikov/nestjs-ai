import { jsonrepair } from 'jsonrepair'

/** Opening markdown fence with an optional language tag: ```json, ```js, ```jsonc, ``` */
const FENCE_OPEN_RE = /```(?:[a-zA-Z][\w-]*(?=[\s{[]))?[ \t]*\r?\n?/
const FENCE = '```'
/** What may follow `[` at the start of a JSON array (besides whitespace). */
const ARRAY_VALUE_START_RE = /^(?:[\]{["'\d-]|true\b|false\b|null\b)/
/** What may follow `{` at the start of a JSON object (besides whitespace). */
const OBJECT_KEY_START_RE = /^["'}]/
const UNCLOSED = -2
const MISMATCHED = -1

interface ScanResult {
  /** Complete top-level `{...}` / `[...]` segments. */
  segments: string[]
  /** Where scanning stopped: the end of the text or a closing fence. */
  end: number
  /** True when a value that looks like JSON is opened but never closed (e.g. cut-off output). */
  unclosed: boolean
}

/**
 * Extracts and repairs JSON from a raw LLM response string.
 * Handles markdown code blocks, leading/trailing text, and malformed JSON.
 * Throws when the JSON value is incomplete instead of guessing the missing part.
 */
export function parseJson(raw: string): unknown {
  const extracted = extractJson(raw.trim())
  const repaired = jsonrepair(extracted)
  return JSON.parse(repaired)
}

function extractJson(text: string): string {
  const fence = FENCE_OPEN_RE.exec(text)
  const body = fence ? text.slice(fence.index + fence[0].length) : text
  const { segments, unclosed } = scan(body, false)

  // Repairing a cut-off value would silently return partial data (or a nested fragment of it).
  if (unclosed) throw new Error('The response contains an incomplete JSON value (the output may have been cut off)')
  if (segments.length > 0) {
    // Inside a code block the first value is the payload; in free text pick the most plausible one.
    if (fence) return segments[0]!
    return longest(segments.filter(isStrictJson)) ?? longest(segments)!
  }
  // No object or array: a primitive value or plain text, left for jsonrepair.
  return (fence ? stripClosingFence(body) : body).trim()
}

function stripClosingFence(text: string): string {
  const end = text.lastIndexOf(FENCE)
  return end === -1 ? text : text.slice(0, end)
}

/**
 * Collects top-level JSON segments. Brackets inside strings are ignored; prose brackets that never
 * close (`:{`, `[see below`) are skipped. Inside a code block, scanning stops at the closing fence.
 */
function scan(text: string, stopAtFence: boolean): ScanResult {
  const segments: string[] = []
  let i = 0
  while (i < text.length) {
    if (stopAtFence && text.startsWith(FENCE, i)) return { segments, end: i, unclosed: false }
    const ch = text[i]
    if (ch === '{' || ch === '[') {
      const close = findClosingIndex(text, i)
      if (close >= 0) {
        segments.push(text.slice(i, close + 1))
        i = close + 1
        continue
      }
      if (close === UNCLOSED && looksLikeJsonStart(text, i)) return { segments, end: text.length, unclosed: true }
    }
    i++
  }
  return { segments, end: text.length, unclosed: false }
}

function looksLikeJsonStart(text: string, openIndex: number): boolean {
  const rest = text.slice(openIndex + 1).trimStart()
  if (rest === '') return true
  return (text[openIndex] === '{' ? OBJECT_KEY_START_RE : ARRAY_VALUE_START_RE).test(rest)
}

function isStrictJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function longest(items: string[]): string | undefined {
  return items.reduce<string | undefined>((best, item) => (best === undefined || item.length > best.length ? item : best), undefined)
}

/** Index of the bracket that closes the one at `start`, or MISMATCHED / UNCLOSED. */
function findClosingIndex(text: string, start: number): number {
  const expected: string[] = []
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') expected.push('}')
    else if (ch === '[') expected.push(']')
    else if (ch === '}' || ch === ']') {
      if (expected.pop() !== ch) return MISMATCHED
      if (expected.length === 0) return i
    }
  }
  return UNCLOSED
}
