import { describe, expect, it } from 'vitest'
import { AI_DEFAULT_BASE_URLS, AI_MODES, DEFAULT_AI_CONFIG, isAiMode } from './ai'

describe('AI gateway shared configuration', () => {
  it('accepts every supported mode and rejects unknown values', () => {
    for (const mode of AI_MODES) expect(isAiMode(mode)).toBe(true)
    expect(isAiMode('gemini')).toBe(false)
    expect(isAiMode(null)).toBe(false)
  })

  it('keeps Agent CLI / MCP as the backwards-compatible default', () => {
    expect(DEFAULT_AI_CONFIG).toEqual({ mode: 'cli', model: '', baseUrl: '' })
  })

  it('provides direct API defaults without hard-coding a model', () => {
    expect(AI_DEFAULT_BASE_URLS.openai).toBe('https://api.openai.com/v1')
    expect(AI_DEFAULT_BASE_URLS.anthropic).toBe('https://api.anthropic.com/v1')
    expect(AI_DEFAULT_BASE_URLS.openai_compatible).toContain('/v1')
  })
})
