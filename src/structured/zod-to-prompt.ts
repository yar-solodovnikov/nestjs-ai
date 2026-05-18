import type { ZodTypeAny } from 'zod'

/**
 * Converts a Zod schema to a human-readable description for the LLM prompt.
 * Helps weaker models (Ollama) understand the expected output shape.
 */
export function zodToPrompt(schema: ZodTypeAny): string {
  return `Return ONLY valid JSON matching this schema:\n${describeSchema(schema, 0)}`
}

function indent(depth: number): string {
  return '  '.repeat(depth)
}

function describeSchema(schema: ZodTypeAny, depth: number): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def
  const typeName: string = def?.typeName ?? ''

  if (typeName === 'ZodObject') {
    const shape = def.shape()
    const fields = Object.entries(shape)
      .map(([key, val]) => `${indent(depth + 1)}"${key}": ${describeSchema(val as ZodTypeAny, depth + 1)}`)
      .join(',\n')
    return `{\n${fields}\n${indent(depth)}}`
  }

  if (typeName === 'ZodArray') {
    return `[${describeSchema(def.type, depth)}]`
  }

  if (typeName === 'ZodOptional') return `${describeSchema(def.innerType, depth)} | null`
  if (typeName === 'ZodNullable') return `${describeSchema(def.innerType, depth)} | null`
  if (typeName === 'ZodEnum') return def.values.map((v: string) => `"${v}"`).join(' | ')
  if (typeName === 'ZodString') return '"string"'
  if (typeName === 'ZodNumber') return 'number'
  if (typeName === 'ZodBoolean') return 'boolean'
  if (typeName === 'ZodNull') return 'null'
  if (typeName === 'ZodLiteral') return JSON.stringify(def.value)
  if (typeName === 'ZodDefault') return describeSchema(def.innerType, depth)
  if (typeName === 'ZodUnion') {
    return (def.options as ZodTypeAny[]).map(o => describeSchema(o, depth)).join(' | ')
  }

  return 'unknown'
}
