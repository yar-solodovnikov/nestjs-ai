import { jsonrepair } from 'jsonrepair'

/** Opening markdown fence with an optional language tag: ```json, ```js, ```jsonc, ``` */
const FENCE_OPEN_RE = /```(?:[a-zA-Z][\w-]*(?=[\s{[]))?[ \t]*\r?\n?/
const FENCE = '```'
const FIRST_BRACE_RE = /[{[]/

/**
 * Extracts and repairs JSON from a raw LLM response string.
 * Handles markdown code blocks, leading/trailing text, and malformed JSON.
 */
export function parseJson(raw: string): unknown {
  const extracted = extractJson(raw.trim())
  const repaired = jsonrepair(extracted)
  return JSON.parse(repaired)
}

function extractJson(text: string): string {
  const fence = FENCE_OPEN_RE.exec(text)
  const body = fence ? text.slice(fence.index + fence[0].length) : text

  const candidates = findBalancedSegments(body)
  if (candidates.length > 0) {
    // Inside a code block the first value is the payload; in free text pick the most plausible one.
    if (fence) return candidates[0]!
    return longest(candidates.filter(isStrictJson)) ?? longest(candidates)!
  }

  // No complete JSON value (e.g. the output was truncated) — let jsonrepair close it.
  const content = fence ? stripClosingFence(body) : body
  const start = content.search(FIRST_BRACE_RE)
  return start === -1 ? content.trim() : content.slice(start)
}

function stripClosingFence(text: string): string {
  const end = text.lastIndexOf(FENCE)
  return end === -1 ? text : text.slice(0, end)
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

/** Top-level `{...}` / `[...]` segments with balanced brackets, ignoring brackets inside strings. */
function findBalancedSegments(text: string): string[] {
  const segments: string[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '{' || ch === '[') {
      const end = findClosingIndex(text, i)
      if (end !== -1) {
        segments.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
    }
    i++
  }
  return segments
}

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
      if (expected.pop() !== ch) return -1
      if (expected.length === 0) return i
    }
  }
  return -1
}
