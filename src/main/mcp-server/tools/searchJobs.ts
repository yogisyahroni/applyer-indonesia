import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'
import { searchJobs } from '../../browser/jobSearch'
import { INDONESIA_DEFAULT_LOCATION } from '../../browser/indonesia'
import type { JobSource } from '../../browser/sourceRouter'
import { logActivity } from '../../db/repositories/activityLogRepository'
import { upsertIndexedJobs } from '../../db/repositories/indexedJobsRepository'
import { broadcastIndexedJobsChanged } from '../../ipc/jobsBroadcast'
import { jsonResult, textError } from '../toolResult'
import type { searchJobsShape } from '../schemas'
import { SEARCH_JOBS_DEFAULT_LIMIT } from '@shared/constants'

type ShapeArgs = { [K in keyof typeof searchJobsShape]: z.infer<(typeof searchJobsShape)[K]> }
type Args = Partial<ShapeArgs> & Pick<ShapeArgs, 'query'>

const INDONESIA_DEFAULT_SOURCES: JobSource[] = [
  'jobstreet',
  'indeed',
  'linkedin',
  'greenhouse',
  'lever',
  'ashby',
  'workday'
]

export async function searchJobsTool(args: Args): Promise<CallToolResult> {
  try {
    const indonesiaOnly = args.indonesiaOnly ?? true
    const location = args.location?.trim() || (indonesiaOnly ? INDONESIA_DEFAULT_LOCATION : undefined)
    const sources = args.sources && args.sources.length > 0 ? args.sources : INDONESIA_DEFAULT_SOURCES

    const outcome = await searchJobs({
      query: args.query,
      location,
      sources,
      limit: args.limit ?? SEARCH_JOBS_DEFAULT_LIMIT,
      indonesiaOnly
    })

    logActivity('info', `search_jobs "${args.query}" -> ${outcome.results.length} results`, {
      sources: outcome.searchedSources,
      indonesiaOnly,
      location: location ?? null
    })

    if (outcome.results.length > 0) {
      // Indexing is a side effect on top of the search the agent actually
      // asked for — a persistence hiccup here shouldn't turn an otherwise
      // successful search into an error response.
      try {
        upsertIndexedJobs(outcome.results, args.query, location ?? null)
        broadcastIndexedJobsChanged()
      } catch (err) {
        logActivity('error', 'Failed to index search_jobs results', { error: String(err) })
      }
    }

    return jsonResult(outcome)
  } catch (err) {
    logActivity('error', 'search_jobs failed', { error: String(err) })
    return textError(`Search failed: ${String(err)}`)
  }
}
