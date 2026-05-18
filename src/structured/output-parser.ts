import { jsonrepair } from 'jsonrepair'

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/i
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
  const blockMatch = JSON_BLOCK_RE.exec(text)
  if (blockMatch?.[1]) return blockMatch[1].trim()

  const start = text.search(FIRST_BRACE_RE)
  if (start === -1) return text

  const closingChar = text[start] === '{' ? '}' : ']'
  const end = text.lastIndexOf(closingChar)
  if (end === -1) return text.slice(start)

  return text.slice(start, end + 1)
}
