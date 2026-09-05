import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_PROVIDER_META,
  accountProviderForUrl,
  isAccountLoginUrl
} from './accountConnection'

describe('accountProviderForUrl', () => {
  it('recognizes Indonesia job platforms and their auth subdomains', () => {
    expect(accountProviderForUrl('https://id.jobstreet.com/id/job/123')).toBe('jobstreet')
    expect(accountProviderForUrl('https://www.linkedin.com/jobs/view/123')).toBe('linkedin')
    expect(accountProviderForUrl('https://id.indeed.com/viewjob?jk=123')).toBe('indeed')
    expect(accountProviderForUrl('https://secure.indeed.com/account/login')).toBe('indeed')
  })

  it('does not attach a platform session to an external ATS', () => {
    expect(accountProviderForUrl('https://boards.greenhouse.io/acme/jobs/123')).toBeNull()
  })
})

describe('account login detection', () => {
  it('detects login and verification routes used by supported platforms', () => {
    expect(isAccountLoginUrl('jobstreet', ACCOUNT_PROVIDER_META.jobstreet.loginUrl)).toBe(true)
    expect(isAccountLoginUrl('linkedin', 'https://www.linkedin.com/checkpoint/challenge/123')).toBe(true)
    expect(isAccountLoginUrl('indeed', ACCOUNT_PROVIDER_META.indeed.loginUrl)).toBe(true)
  })

  it('does not treat a normal job page as a login page', () => {
    expect(isAccountLoginUrl('jobstreet', 'https://id.jobstreet.com/id/job/123')).toBe(false)
    expect(isAccountLoginUrl('linkedin', 'https://www.linkedin.com/jobs/view/123')).toBe(false)
  })
})
