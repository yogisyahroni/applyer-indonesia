export const ACCOUNT_PROVIDERS = ['jobstreet', 'linkedin', 'indeed'] as const

export type AccountProvider = (typeof ACCOUNT_PROVIDERS)[number]

export interface AccountConnectionStatus {
  provider: AccountProvider
  connected: boolean
  persistence: 'encrypted' | 'memory' | 'none'
  updatedAt: string | null
  error?: string
}

export interface AccountProviderMeta {
  provider: AccountProvider
  label: string
  loginUrl: string
  requiresSessionForPlatformApply: boolean
}

export const ACCOUNT_PROVIDER_META: Record<AccountProvider, AccountProviderMeta> = {
  jobstreet: {
    provider: 'jobstreet',
    label: 'JobStreet',
    loginUrl: 'https://id.jobstreet.com/id/oauth/login',
    requiresSessionForPlatformApply: true
  },
  linkedin: {
    provider: 'linkedin',
    label: 'LinkedIn',
    loginUrl: 'https://www.linkedin.com/login',
    requiresSessionForPlatformApply: true
  },
  indeed: {
    provider: 'indeed',
    label: 'Indeed',
    loginUrl: 'https://secure.indeed.com/account/login',
    requiresSessionForPlatformApply: false
  }
}

export function accountProviderForUrl(url: string): AccountProvider | null {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }

  if (hostname === 'id.jobstreet.com' || hostname.endsWith('.jobstreet.com') || hostname.endsWith('.jobstreet.co.id')) {
    return 'jobstreet'
  }
  if (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')) return 'linkedin'
  if (hostname === 'indeed.com' || hostname.endsWith('.indeed.com')) return 'indeed'
  return null
}

export function isAccountLoginUrl(provider: AccountProvider, url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  const host = parsed.hostname.toLowerCase()
  const path = parsed.pathname.toLowerCase()

  if (provider === 'jobstreet') {
    return (host === 'id.jobstreet.com' || host.endsWith('.jobstreet.com')) && path.endsWith('/oauth/login')
  }
  if (provider === 'linkedin') {
    return (host === 'linkedin.com' || host.endsWith('.linkedin.com')) &&
      (path.startsWith('/login') || path.startsWith('/checkpoint') || path.startsWith('/authwall'))
  }
  return host === 'secure.indeed.com' &&
    (path.startsWith('/account/login') || path.startsWith('/auth') || path.startsWith('/oauth'))
}
