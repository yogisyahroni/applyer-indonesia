import { describe, expect, it } from 'vitest'
import { AI_TOOLS, aiToolJsonSchema, getAiTool } from './toolRegistry'

describe('direct AI Applyer tool registry', () => {
  it('keeps the same core capabilities available to Direct API agents', () => {
    const names = AI_TOOLS.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(
      expect.arrayContaining([
        'get_profile',
        'update_profile',
        'search_jobs',
        'get_job_details',
        'queue_job',
        'list_jobs',
        'flag_failure',
        'fill_application',
        'exclude_job',
        'add_company_board',
        'list_company_boards'
      ])
    )
  })

  it('emits provider-ready JSON schemas without Zod metadata', () => {
    const search = getAiTool('search_jobs')
    expect(search).toBeDefined()
    const schema = aiToolJsonSchema(search!)
    expect(schema.type).toBe('object')
    expect(schema.properties).toBeTruthy()
    expect(schema.$schema).toBeUndefined()
  })
})
