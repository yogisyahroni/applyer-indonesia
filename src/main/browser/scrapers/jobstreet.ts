import { newHeadlessContext } from '../browserController'
import { detectCaptcha } from '../captchaDetector'
import { htmlToPlainText, sanitizeDescriptionHtml } from '../htmlContent'
import { indonesiaSearchLocation } from '../indonesia'
import type { JobDetailsOutcome, JobSearchResultItem } from '../types'

interface RawJobStreetCard {
  title: string
  company?: string
  location?: string
  url: string
  snippet?: string
  salaryRange?: string
  postedAt?: string
}

export interface JobStreetSearchResult {
  results: JobSearchResultItem[]
  blocked: boolean
  warning?: string
}

export function jobStreetSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildJobStreetSearchUrl(query: string, location?: string): string {
  const querySlug = jobStreetSlug(query) || 'jobs'
  const locationSlug = jobStreetSlug(indonesiaSearchLocation(location)) || 'indonesia'
  return `https://id.jobstreet.com/${querySlug}-jobs/in-${locationSlug}`
}

export async function searchJobStreet(
  query: string,
  location: string | undefined,
  limit: number
): Promise<JobStreetSearchResult> {
  const context = await newHeadlessContext()
  try {
    const page = await context.newPage()
    await page.goto(buildJobStreetSearchUrl(query, location), {
      waitUntil: 'domcontentloaded',
      timeout: 20000
    })

    const captcha = await detectCaptcha(page)
    if (captcha.blocked) {
      return {
        results: [],
        blocked: true,
        warning: `jobstreet: blocked by a verification challenge (${captcha.reason})`
      }
    }

    const cards = await page.evaluate((maxResults): RawJobStreetCard[] => {
      const results: RawJobStreetCard[] = []
      const seen = new Set<string>()
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/job/"]'))

      for (const link of links) {
        if (results.length >= maxResults) break

        let parsed: URL
        try {
          parsed = new URL(link.href, window.location.origin)
        } catch {
          continue
        }
        if (!/^\/job\/\d+/.test(parsed.pathname)) continue

        const canonicalUrl = `${parsed.origin}${parsed.pathname}`
        if (seen.has(canonicalUrl)) continue

        const root =
          link.closest('article') ??
          link.closest('[data-automation="normalJob"]') ??
          link.closest('[data-testid*="job"]') ??
          link.parentElement?.parentElement
        if (!root) continue

        const title =
          root.querySelector('[data-automation="jobTitle"]')?.textContent?.trim() ??
          link.textContent?.trim() ??
          ''
        if (!title) continue

        const company =
          root.querySelector('[data-automation="jobCompany"]')?.textContent?.trim() ??
          root.querySelector('[data-testid="job-company"]')?.textContent?.trim() ??
          root.querySelector('a[href*="/companies/"]')?.textContent?.trim()
        const jobLocation =
          root.querySelector('[data-automation="jobLocation"]')?.textContent?.trim() ??
          root.querySelector('[data-testid="job-location"]')?.textContent?.trim()
        const salaryRange =
          root.querySelector('[data-automation="jobSalary"]')?.textContent?.trim() ??
          root.querySelector('[data-testid="job-salary"]')?.textContent?.trim()
        const snippet =
          root.querySelector('[data-automation="jobShortDescription"]')?.textContent?.trim() ??
          root.querySelector('[data-testid="job-description"]')?.textContent?.trim() ??
          ''
        const postedAt =
          root.querySelector('[data-automation="jobListingDate"]')?.textContent?.trim() ??
          root.querySelector('time')?.getAttribute('datetime') ??
          undefined

        seen.add(canonicalUrl)
        results.push({
          title,
          company,
          location: jobLocation,
          url: canonicalUrl,
          snippet,
          salaryRange,
          postedAt
        })
      }

      return results
    }, limit)

    const results: JobSearchResultItem[] = cards.map((card) => ({
      title: card.title,
      company: card.company || 'Private Advertiser',
      location: card.location,
      url: card.url,
      source: 'jobstreet',
      snippet: card.snippet ?? '',
      salaryRange: card.salaryRange,
      postedAt: card.postedAt
    }))

    return { results, blocked: false }
  } finally {
    await context.close()
  }
}

export async function fetchJobStreetJobDetails(url: string): Promise<JobDetailsOutcome> {
  const context = await newHeadlessContext()
  try {
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    const captcha = await detectCaptcha(page)
    if (captcha.blocked) {
      return {
        status: 'blocked',
        reasonTag: 'captcha_verification',
        message: `JobStreet presented a verification challenge (${captcha.reason}).`
      }
    }

    const data = await page.evaluate(() => {
      const descriptionNode =
        document.querySelector('[data-automation="jobAdDetails"]') ??
        document.querySelector('[data-testid="job-description"]') ??
        document.querySelector('article')
      const applyLink =
        document.querySelector<HTMLAnchorElement>('a[data-automation*="apply" i]') ??
        document.querySelector<HTMLAnchorElement>('a[href*="apply" i]')

      return {
        title:
          document.querySelector('[data-automation="job-detail-title"]')?.textContent?.trim() ??
          document.querySelector('h1')?.textContent?.trim() ??
          '',
        company:
          document.querySelector('[data-automation="advertiser-name"]')?.textContent?.trim() ??
          document.querySelector('[data-testid="company-name"]')?.textContent?.trim() ??
          document.querySelector('a[href*="/companies/"]')?.textContent?.trim() ??
          'Private Advertiser',
        location:
          document.querySelector('[data-automation="job-detail-location"]')?.textContent?.trim() ??
          document.querySelector('[data-testid="job-location"]')?.textContent?.trim(),
        salaryRange:
          document.querySelector('[data-automation="job-detail-salary"]')?.textContent?.trim() ??
          document.querySelector('[data-testid="job-salary"]')?.textContent?.trim(),
        descriptionHtml: descriptionNode?.innerHTML ?? '',
        applicationUrl: applyLink?.href ?? window.location.href
      }
    })

    if (!data.descriptionHtml) {
      return {
        status: 'not_found',
        message: 'Could not find a job description on this JobStreet page; the listing may have expired or changed.'
      }
    }

    const html = sanitizeDescriptionHtml(data.descriptionHtml)
    return {
      status: 'ok',
      details: {
        title: data.title,
        company: data.company,
        location: data.location,
        description: html,
        descriptionText: htmlToPlainText(html),
        applicationUrl: data.applicationUrl,
        detectedAts: 'jobstreet',
        requiresLogin: false,
        applyMethod: 'external_form',
        salaryRange: data.salaryRange
      }
    }
  } finally {
    await context.close()
  }
}
