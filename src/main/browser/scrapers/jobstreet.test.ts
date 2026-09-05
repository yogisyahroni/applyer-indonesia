import { describe, expect, it } from 'vitest'
import { buildJobStreetSearchUrl, normalizeJobStreetUrl } from './jobstreet'

describe('buildJobStreetSearchUrl', () => {
  it('builds an Indonesia-wide JobStreet URL when location is omitted', () => {
    expect(buildJobStreetSearchUrl('Software Engineer')).toBe('https://id.jobstreet.com/id/software-engineer-jobs')
  })

  it('adds a location path for Indonesian city/region searches', () => {
    expect(buildJobStreetSearchUrl('Data Analyst', 'Jakarta Selatan')).toBe(
      'https://id.jobstreet.com/id/data-analyst-jobs/in-jakarta-selatan'
    )
  })

  it('normalizes punctuation and repeated whitespace', () => {
    expect(buildJobStreetSearchUrl('  QA / Test Engineer  ', 'DI Yogyakarta')).toBe(
      'https://id.jobstreet.com/id/qa-test-engineer-jobs/in-di-yogyakarta'
    )
  })
})

describe('normalizeJobStreetUrl', () => {
  it('turns a relative current JobStreet job URL into an absolute URL', () => {
    expect(normalizeJobStreetUrl('/id/job/93747083?origin=cardTitle')).toBe(
      'https://id.jobstreet.com/id/job/93747083?origin=cardTitle'
    )
  })

  it('keeps an absolute JobStreet URL intact', () => {
    expect(normalizeJobStreetUrl('https://id.jobstreet.com/id/job/123')).toBe('https://id.jobstreet.com/id/job/123')
  })
})
