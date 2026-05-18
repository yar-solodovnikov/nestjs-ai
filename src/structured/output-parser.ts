import { jsonrepair } from 'jsonrepair'

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/i
const FIRST_BRACE_RE = /[{[]/
const LAST_BRACE_RE = /[}\]]/

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
  // Strip markdown code block if present
  const blockMatch = JSON_BLOCK_RE.exec(text)
  if (blockMatch?.[1]) return blockMatch[1].trim()

  // Find the first { or [ and last } or ]
  const start = text.search(FIRST_BRACE_RE)
  if (start === -1) return text

  const end = text.lastIndexOf(text[start] === '{' ? '}' : ']')
  if (end === -1) return text.slice(start)

  return text.slice(start, end + 1)
}
