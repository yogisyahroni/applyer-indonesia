import { newHeadlessContext } from '../browserController'
import { detectCaptcha } from '../captchaDetector'
import { htmlToPlainText, sanitizeDescriptionHtml } from '../htmlContent'
import type { JobDetailsOutcome, JobSearchResultItem } from '../types'

const JOBSTREET_ORIGIN = 'https://id.jobstreet.com'

interface RawJobStreetCard {
  href?: string
  title?: string
  company?: string
  location?: string
  snippet?: string
  salary?: string
  listedAt?: string | null
}

export interface JobStreetSearchResult {
  results: JobSearchResultItem[]
  blocked: boolean
  warning?: string
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildJobStreetSearchUrl(query: string, location?: string): string {
  const querySlug = slugify(query) || 'lowongan'
  const locationSlug = location ? slugify(location) : ''
  return `${JOBSTREET_ORIGIN}/id/${querySlug}-jobs${locationSlug ? `/in-${locationSlug}` : ''}`
}

export function normalizeJobStreetUrl(href: string): string {
  return new URL(href, JOBSTREET_ORIGIN).toString()
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

    const cards = await page.evaluate((): RawJobStreetCard[] => {
      const directCards = Array.from(document.querySelectorAll('[data-automation="normalJob"]'))
      const fallbackCards = Array.from(
        document.querySelectorAll('a[data-automation="job-list-view-job-link"], a[href*="/id/job/"], a[href*="/job/"]')
      )
        .map((anchor) => anchor.closest('article') ?? anchor.parentElement)
        .filter((node) => node !== null)

      const nodes = directCards.length > 0 ? directCards : Array.from(new Set(fallbackCards))

      return nodes.map((node) => {
        const anchor = (
          node.querySelector('a[data-automation="job-list-view-job-link"]') ??
          node.querySelector('a[href*="/id/job/"], a[href*="/job/"]')
        ) as HTMLAnchorElement | null

        return {
          href: anchor?.getAttribute('href') ?? undefined,
          title:
            node.querySelector('[data-automation="jobTitle"]')?.textContent?.trim() ??
            anchor?.textContent?.trim() ??
            undefined,
          company:
            node.querySelector('[data-automation="jobCompany"]')?.textContent?.trim() ??
            node.querySelector('[data-automation="advertiser-name"]')?.textContent?.trim() ??
            undefined,
          location: node.querySelector('[data-automation="jobLocation"]')?.textContent?.trim(),
          snippet:
            node.querySelector('[data-automation="jobShortDescription"]')?.textContent?.trim() ??
            node.querySelector('[data-automation="jobTeaser"]')?.textContent?.trim(),
          salary: node.querySelector('[data-automation="jobSalary"]')?.textContent?.trim(),
          listedAt: node.querySelector('time')?.getAttribute('datetime') ?? null
        }
      })
    })

    const seen = new Set<string>()
    const results: JobSearchResultItem[] = []
    for (const card of cards) {
      if (!card.href || !card.title) continue
      const url = normalizeJobStreetUrl(card.href)
      if (seen.has(url)) continue
      seen.add(url)
      results.push({
        title: card.title,
        company: card.company || 'Perusahaan tidak dicantumkan',
        location: card.location,
        url,
        source: 'jobstreet',
        postedAt: card.listedAt ?? undefined,
        snippet: card.snippet ?? '',
        salaryRange: card.salary
      })
      if (results.length >= limit) break
    }

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
      const applyLink =
        document.querySelector<HTMLAnchorElement>('a[data-automation="job-detail-apply"]') ??
        document.querySelector<HTMLAnchorElement>('a[data-automation="jobApplyButton"]')

      return {
        title:
          document.querySelector('[data-automation="job-detail-title"]')?.textContent?.trim() ??
          document.querySelector('[data-automation="jobTitle"]')?.textContent?.trim() ??
          document.querySelector('h1')?.textContent?.trim() ??
          '',
        company:
          document.querySelector('[data-automation="advertiser-name"]')?.textContent?.trim() ??
          document.querySelector('[data-automation="job-detail-company"]')?.textContent?.trim() ??
          document.querySelector('[data-automation="jobCompany"]')?.textContent?.trim() ??
          '',
        location:
          document.querySelector('[data-automation="job-detail-location"]')?.textContent?.trim() ??
          document.querySelector('[data-automation="jobLocation"]')?.textContent?.trim(),
        descriptionHtml:
          document.querySelector('[data-automation="jobAdDetails"]')?.innerHTML ??
          document.querySelector('[data-automation="jobDescription"]')?.innerHTML ??
          document.querySelector('#jobAdDetails')?.innerHTML ??
          '',
        salary: document.querySelector('[data-automation="jobSalary"]')?.textContent?.trim(),
        applyHref: applyLink?.getAttribute('href') ?? undefined
      }
    })

    if (!data.descriptionHtml) {
      return {
        status: 'not_found',
        message: 'Could not find a job description on this JobStreet page; the posting may have expired or changed.'
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
        applicationUrl: data.applyHref ? normalizeJobStreetUrl(data.applyHref) : url,
        detectedAts: 'jobstreet',
        requiresLogin: true,
        applyMethod: 'external_form',
        salaryRange: data.salary
      }
    }
  } finally {
    await context.close()
  }
}
