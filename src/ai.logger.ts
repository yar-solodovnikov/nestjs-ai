export interface AiRequestEvent {
  prompt: string
  attempt: number
  adapterOptions?: Record<string, unknown>
}

export interface AiResponseEvent {
  prompt: string
  attempt: number
  durationMs: number
  success: boolean
  error?: string
}

export interface AiLogger {
  onRequest?(event: AiRequestEvent): void
  onResponse?(event: AiResponseEvent): void
  onRetry?(attempt: number, error: Error): void
}

const PROMPT_PREVIEW_LENGTH = 80

/** Built-in logger that prints to console. Pass to AiModuleOptions.logger. */
export const consoleAiLogger: AiLogger = {
  onRequest({ prompt, attempt }) {
    console.log(`[nestjs-ai] attempt ${attempt} — prompt: ${prompt.slice(0, PROMPT_PREVIEW_LENGTH)}${prompt.length > PROMPT_PREVIEW_LENGTH ? '…' : ''}`)
  },
  onResponse({ attempt, durationMs, success, error }) {
    if (success) {
      console.log(`[nestjs-ai] attempt ${attempt} succeeded in ${durationMs}ms`)
    } else {
      console.warn(`[nestjs-ai] attempt ${attempt} failed in ${durationMs}ms — ${error}`)
    }
  },
  onRetry(attempt, error) {
    console.warn(`[nestjs-ai] retry ${attempt}: ${error.message}`)
  },
}
