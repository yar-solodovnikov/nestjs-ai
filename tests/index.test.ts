import 'reflect-metadata'
import { describe, it, expect } from 'vitest'

// Importing from index.ts covers the re-export barrel file
import {
  AiModule,
  AiService,
  InjectAi,
  consoleAiLogger,
  AiError,
  openaiAdapter,
  anthropicAdapter,
  ollamaAdapter,
  geminiAdapter,
  AI_SERVICE_TOKEN,
} from '../src/index'

describe('index exports', () => {
  it('exports AiModule', () => { expect(AiModule).toBeDefined() })
  it('exports AiService', () => { expect(AiService).toBeDefined() })
  it('exports InjectAi decorator', () => { expect(typeof InjectAi).toBe('function') })
  it('exports consoleAiLogger', () => { expect(consoleAiLogger).toBeDefined() })
  it('exports AiError', () => { expect(AiError).toBeDefined() })
  it('exports openaiAdapter', () => { expect(typeof openaiAdapter).toBe('function') })
  it('exports anthropicAdapter', () => { expect(typeof anthropicAdapter).toBe('function') })
  it('exports ollamaAdapter', () => { expect(typeof ollamaAdapter).toBe('function') })
  it('exports geminiAdapter', () => { expect(typeof geminiAdapter).toBe('function') })
  it('exports AI_SERVICE_TOKEN factory', () => {
    expect(AI_SERVICE_TOKEN('test')).toBe('AI_SERVICE_test')
  })

  it('InjectAi() returns a ParameterDecorator (function)', () => {
    expect(typeof InjectAi()).toBe('function')
  })

  it('InjectAi("name") returns a ParameterDecorator for named instance', () => {
    expect(typeof InjectAi('fast')).toBe('function')
  })
})
