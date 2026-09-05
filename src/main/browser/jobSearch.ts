import { searchIndeed } from './scrapers/indeed'
import { searchLinkedIn } from './scrapers/linkedin'
import { searchJobStreet } from './scrapers/jobstreet'
import { searchAtsBoards } from './ats/searchAtsBoards'
import { crossSourceKey, interleaveByBoard } from './ats/matching'
import { isUrlExcluded } from '../db/repositories/jobExclusionsRepository'
import { ATS_PROVIDERS, type AtsProvider } from '@shared/types/companyBoard'
import type { JobSearchResultItem } from './types'
import type { JobSource } from './sourceRouter'

export interface SearchJobsParams {
  query: string
  location?: string
  sources?: JobSource[]
  limit: number
}

export interface SearchJobsOutcome {
  results: JobSearchResultItem[]
  searchedSources: string[]
  warnings: string[]
}

/** Broad cross-company search sources. JobStreet is first because this fork is Indonesia-focused. */
const AGGREGATOR_SOURCES: JobSource[] = ['jobstreet', 'indeed', 'linkedin']
const ATS_SOURCES: JobSource[] = [...ATS_PROVIDERS]
const SEARCHABLE_SOURCES: JobSource[] = [...AGGREGATOR_SOURCES, ...ATS_SOURCES]

function isAtsSource(source: JobSource): source is AtsProvider {
  return (ATS_SOURCES as string[]).includes(source)
}

export async function searchJobs(params: SearchJobsParams): Promise<SearchJobsOutcome> {
  const requested = params.sources && params.sources.length > 0 ? params.sources : SEARCHABLE_SOURCES
  const toSearch = requested.filter((s) => SEARCHABLE_SOURCES.includes(s))
  const warnings: string[] = []

  for (const source of requested) {
    if (!SEARCHABLE_SOURCES.includes(source)) {
      warnings.push(
        `${source}: no keyword-search endpoint exists for this source — pass a specific company's job/career-page URL to get_job_details instead.`
      )
    }
  }

  const searchedSources: string[] = []
  let jobStreetResults: JobSearchResultItem[] = []
  let indeedResults: JobSearchResultItem[] = []
  let linkedinResults: JobSearchResultItem[] = []
  let atsResults: JobSearchResultItem[] = []
  const tasks: Promise<void>[] = []

  if (toSearch.includes('jobstreet')) {
    tasks.push(
      (async () => {
        const result = await searchJobStreet(params.query, params.location, params.limit)
        searchedSources.push('jobstreet')
        if (result.warning) warnings.push(result.warning)
        jobStreetResults = result.results
      })()
    )
  }

  if (toSearch.includes('indeed')) {
    tasks.push(
      (async () => {
        const result = await searchIndeed(params.query, params.location, params.limit)
        searchedSources.push('indeed')
        if (result.warning) warnings.push(result.warning)
        indeedResults = result.results
      })()
    )
  }

  if (toSearch.includes('linkedin')) {
    tasks.push(
      (async () => {
        const result = await searchLinkedIn(params.query, params.location, params.limit)
        searchedSources.push('linkedin')
        if (result.warning) warnings.push(result.warning)
        linkedinResults = result.results
      })()
    )
  }

  const atsProviders = toSearch.filter(isAtsSource)
  if (atsProviders.length > 0) {
    tasks.push(
      (async () => {
        const result = await searchAtsBoards({
          query: params.query,
          location: params.location,
          limit: params.limit,
          providers: atsProviders
        })
        searchedSources.push(...result.searchedProviders)
        warnings.push(...result.warnings)
        atsResults = result.results
      })()
    )
  }

  const settled = await Promise.allSettled(tasks)
  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      warnings.push(`A search source failed unexpectedly: ${String(outcome.reason)}`)
    }
  }

  const seenUrls = new Set<string>()
  const keep = (result: JobSearchResultItem): boolean => {
    if (seenUrls.has(result.url)) return false
    if (isUrlExcluded(result.url)) return false
    seenUrls.add(result.url)
    return true
  }

  const keptAts = atsResults.filter(keep)
  const atsIdentities = new Set(keptAts.map((r) => crossSourceKey(r.company, r.title, r.location)))
  const keptAggregators = [...jobStreetResults, ...indeedResults, ...linkedinResults].filter(
    (result) => !atsIdentities.has(crossSourceKey(result.company, result.title, result.location)) && keep(result)
  )

  const results = interleaveByBoard([keptAts, keptAggregators], params.limit)
  return { results, searchedSources, warnings }
}
