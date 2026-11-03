import type { ZodTypeAny } from 'zod'

/**
 * Converts a Zod schema to a human-readable description for the LLM prompt.
 * Helps weaker models (Ollama) understand the expected output shape.
 * Supports both zod v3 and zod v4 schemas.
 */
export function zodToPrompt(schema: ZodTypeAny): string {
  return `Return ONLY valid JSON matching this schema:\n${describeSchema(schema, 0, new Set())}`
}

function indent(depth: number): string {
  return '  '.repeat(depth)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = any

/**
 * Normalizes the schema kind across zod versions:
 * v3 stores `_def.typeName` ('ZodObject'), v4 stores `_zod.def.type` ('object').
 */
function getKind(schema: AnyDef): { kind: string, def: AnyDef } {
  const v4Def = schema?._zod?.def
  if (v4Def?.type) return { kind: String(v4Def.type), def: v4Def }
  const v3Def = schema?._def
  const typeName: string = v3Def?.typeName ?? ''
  return { kind: typeName.replace(/^Zod/, '').toLowerCase(), def: v3Def }
}

/** Enum values without the reverse mapping TypeScript adds to numeric enums. */
function enumValues(entries: Record<string, unknown>): unknown[] {
  return Object.entries(entries)
    .filter(([key]) => Number.isNaN(Number(key)))
    .map(([, value]) => value)
}

/**
 * `expanding` holds the schemas on the current path. Recursive schemas (trees, linked lists) refer
 * back to an ancestor through z.lazy() or, in zod v4, a getter in the object shape.
 */
function describeSchema(schema: ZodTypeAny, depth: number, expanding: Set<unknown>): string {
  if (expanding.has(schema)) return '(recursive: same structure as the enclosing value)'
  expanding.add(schema)
  try {
    const base = describeType(schema, depth, expanding)
    const description = (schema as AnyDef)?.description
    return description ? `${base} (${description})` : base
  } finally {
    expanding.delete(schema)
  }
}

function describeType(schema: ZodTypeAny, depth: number, expanding: Set<unknown>): string {
  const { kind, def } = getKind(schema)
  const child = (s: unknown): string => describeSchema(s as ZodTypeAny, depth, expanding)

  switch (kind) {
    case 'object': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape
      const fields = Object.entries(shape as Record<string, unknown>)
        .map(([key, val]) => `${indent(depth + 1)}${JSON.stringify(key)}: ${describeSchema(val as ZodTypeAny, depth + 1, expanding)}`)
        .join(',\n')
      return `{\n${fields}\n${indent(depth)}}`
    }
    case 'array':
      // v3: def.type, v4: def.element
      return `[${child(def.element ?? def.type)}]`
    case 'tuple':
      return `[${(def.items as unknown[]).map(child).join(', ')}]`
    case 'record':
      return `{ [key: string]: ${child(def.valueType)} }`
    case 'optional':
      return `${child(def.innerType)} (optional, may be omitted)`
    case 'nullable':
      return `${child(def.innerType)} | null`
    case 'default':
    case 'prefault':
    case 'catch':
    case 'readonly':
    case 'nonoptional':
      return child(def.innerType)
    case 'branded':
      return child(def.type)
    case 'effects':
      // v3 .refine()/.transform()/z.preprocess()
      return child(def.schema)
    case 'pipeline':
    case 'pipe':
      // v4 .transform() and .pipe() — the LLM must produce the input side
      return child(def.in)
    case 'intersection':
      return `${child(def.left)} & ${child(def.right)}`
    case 'union':
    case 'discriminatedunion':
      return (def.options as unknown[]).map(child).join(' | ')
    case 'enum': {
      // v3: def.values (array), v4: def.entries (object)
      const values = Array.isArray(def.values) ? def.values : enumValues(def.entries)
      return values.map((v: unknown) => JSON.stringify(v)).join(' | ')
    }
    case 'nativeenum':
      return enumValues(def.values).map(v => JSON.stringify(v)).join(' | ')
    case 'literal': {
      // v3: def.value, v4: def.values (array)
      const values: unknown[] = Array.isArray(def.values) ? def.values : [def.value]
      return values.map(v => JSON.stringify(v)).join(' | ')
    }
    case 'string': return '"string"'
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'null': return 'null'
    case 'date': return '"ISO 8601 date string"'
    case 'lazy':
      return child(def.getter())
    case 'any':
    case 'unknown':
      return 'any'
    default:
      return 'unknown'
  }
}
