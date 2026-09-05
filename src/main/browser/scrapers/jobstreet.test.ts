import { describe, expect, it } from 'vitest'
import { buildJobStreetSearchUrl, jobStreetSlug } from './jobstreet'

describe('jobStreetSlug', () => {
  it('turns job keywords into JobStreet path slugs', () => {
    expect(jobStreetSlug('Backend Developer')).toBe('backend-developer')
    expect(jobStreetSlug('QA / Software Tester')).toBe('qa-software-tester')
  })
})

describe('buildJobStreetSearchUrl', () => {
  it('builds a city-specific JobStreet Indonesia search URL', () => {
    expect(buildJobStreetSearchUrl('Backend Developer', 'Jakarta')).toBe(
      'https://id.jobstreet.com/backend-developer-jobs/in-jakarta'
    )
  })

  it('defaults the location to Indonesia', () => {
    expect(buildJobStreetSearchUrl('Software Engineer')).toBe(
      'https://id.jobstreet.com/software-engineer-jobs/in-indonesia'
    )
  })
})
