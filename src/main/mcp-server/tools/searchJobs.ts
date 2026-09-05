import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod'
import { searchJobs, type SearchJobsParams } from '../../browser/jobSearch'
import { INDONESIA_DEFAULT_LOCATION } from '../../browser/indonesia'
import { logActivity } from '../../db/repositories/activityLogRepository'
import { upsertIndexedJobs } from '../../db/repositories/indexedJobsRepository'
import { broadcastIndexedJobsChanged } from '../../ipc/jobsBroadcast'
import { jsonResult, textError } from '../toolResult'
import type { searchJobsShape } from '../schemas'
import { SEARCH_JOBS_DEFAULT_LIMIT } from '@shared/constants'

type ShapeArgs = { [K in keyof typeof searchJobsShape]: z.infer<(typeof searchJobsShape)[K]> }
type Args = Partial<ShapeArgs> & Pick<ShapeArgs, 'query'>

export async function searchJobsTool(args: Args): Promise<CallToolResult> {
  try {
    // MCP validation supplies the Indonesia defaults declared in schemas.ts.
    // Keeping this conditional makes direct/internal callers backwards-compatible.
    const location = args.location?.trim() || (args.indonesiaOnly === true ? INDONESIA_DEFAULT_LOCATION : undefined)
    const params: SearchJobsParams = {
      query: args.query,
      location,
      sources: args.sources,
      limit: args.limit ?? SEARCH_JOBS_DEFAULT_LIMIT
    }
    if (args.indonesiaOnly !== undefined) params.indonesiaOnly = args.indonesiaOnly

    const outcome = await searchJobs(params)

    logActivity('info', `search_jobs "${args.query}" -> ${outcome.results.length} results`, {
      sources: outcome.searchedSources,
      indonesiaOnly: args.indonesiaOnly ?? null,
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
