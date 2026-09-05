import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { searchJobsShape } from './schemas'

const searchSchema = z.object(searchJobsShape)

describe('Applyer Indonesia MCP defaults', () => {
  it('defaults searches to Indonesia-only and includes JobStreet', () => {
    const parsed = searchSchema.parse({ query: 'backend developer' })
    expect(parsed.indonesiaOnly).toBe(true)
    expect(parsed.sources).toContain('jobstreet')
    expect(parsed.sources).toContain('linkedin')
    expect(parsed.sources).toContain('indeed')
  })

  it('allows an explicit worldwide/outside-Indonesia search', () => {
    const parsed = searchSchema.parse({
      query: 'backend developer',
      location: 'Singapore',
      indonesiaOnly: false,
      sources: ['linkedin']
    })
    expect(parsed.indonesiaOnly).toBe(false)
    expect(parsed.location).toBe('Singapore')
    expect(parsed.sources).toEqual(['linkedin'])
  })
})
