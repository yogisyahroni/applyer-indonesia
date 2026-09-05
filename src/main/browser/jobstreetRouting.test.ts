import { describe, expect, it } from 'vitest'
import { detectSource } from './sourceRouter'

describe('JobStreet source routing', () => {
  it('recognizes current JobStreet Indonesia job URLs', () => {
    expect(detectSource('https://id.jobstreet.com/job/88946289')).toBe('jobstreet')
  })

  it('recognizes the legacy Indonesian JobStreet hostname', () => {
    expect(detectSource('https://www.jobstreet.co.id/id/job/example')).toBe('jobstreet')
  })

  it('does not trust lookalike hosts', () => {
    expect(detectSource('https://id.jobstreet.com.evil.example/job/1')).toBe('generic')
  })
})
