export const AI_MODULE_OPTIONS = Symbol('AI_MODULE_OPTIONS')
export const AI_SERVICE = Symbol('AI_SERVICE')

/** Returns injection token for a named AiService instance. */
export const AI_SERVICE_TOKEN = (name: string): string => `AI_SERVICE_${name}`
