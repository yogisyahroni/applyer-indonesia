import { z, type ZodType } from 'zod'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  searchJobsShape,
  getJobDetailsShape,
  queueJobShape,
  listJobsShape,
  flagFailureShape,
  getProfileShape,
  updateProfileShape,
  fillApplicationShape,
  excludeJobShape,
  addCompanyBoardShape,
  listCompanyBoardsShape
} from '../mcp-server/schemas'
import { getProfileTool } from '../mcp-server/tools/getProfile'
import { updateProfileTool } from '../mcp-server/tools/updateProfile'
import { searchJobsTool } from '../mcp-server/tools/searchJobs'
import { getJobDetailsTool } from '../mcp-server/tools/getJobDetails'
import { queueJobTool } from '../mcp-server/tools/queueJob'
import { listJobsTool } from '../mcp-server/tools/listJobs'
import { flagFailureTool } from '../mcp-server/tools/flagFailure'
import { fillApplicationTool } from '../mcp-server/tools/fillApplication'
import { excludeJobTool } from '../mcp-server/tools/excludeJob'
import { addCompanyBoardTool } from '../mcp-server/tools/addCompanyBoard'
import { listCompanyBoardsTool } from '../mcp-server/tools/listCompanyBoards'

export interface AiToolDefinition {
  name: string
  title: string
  description: string
  schema: ZodType
  execute: (input: unknown) => Promise<CallToolResult>
}

function resultText(result: CallToolResult): string {
  const parts = result.content.map((item) => {
    if (item.type === 'text') return item.text
    return JSON.stringify(item)
  })
  return parts.join('\n') || '(tool returned no text)'
}

export function callToolResultToText(result: CallToolResult): string {
  return resultText(result)
}

export const AI_TOOLS: readonly AiToolDefinition[] = [
  {
    name: 'get_profile',
    title: 'Get candidate profile',
    description: 'Get the candidate profile and uploaded-document metadata before matching jobs or filling applications.',
    schema: z.object(getProfileShape),
    execute: async (input) => getProfileTool(z.object(getProfileShape).parse(input))
  },
  {
    name: 'update_profile',
    title: 'Update candidate profile',
    description: 'Update only profile fields explicitly supported by the user or their materials. Never invent skills, salary, experience, or locations.',
    schema: z.object(updateProfileShape),
    execute: async (input) => updateProfileTool(z.object(updateProfileShape).parse(input))
  },
  {
    name: 'search_jobs',
    title: 'Search jobs',
    description: 'Search JobStreet, LinkedIn, Indeed, and tracked company ATS boards. Salary may be absent and must never be treated as an automatic rejection.',
    schema: z.object(searchJobsShape),
    execute: async (input) => searchJobsTool(z.object(searchJobsShape).parse(input))
  },
  {
    name: 'get_job_details',
    title: 'Get job details',
    description: 'Fetch the full description and application information for a job URL using the appropriate source adapter.',
    schema: z.object(getJobDetailsShape),
    execute: async (input) => getJobDetailsTool(z.object(getJobDetailsShape).parse(input))
  },
  {
    name: 'queue_job',
    title: 'Queue matching job',
    description: 'Add a job to the review board after deciding it is a good match. Duplicate URLs are handled safely.',
    schema: z.object(queueJobShape),
    execute: async (input) => queueJobTool(z.object(queueJobShape).parse(input))
  },
  {
    name: 'list_jobs',
    title: 'List tracked jobs',
    description: 'List jobs already on the board, optionally filtered by status.',
    schema: z.object(listJobsShape),
    execute: async (input) => listJobsTool(z.object(listJobsShape).parse(input))
  },
  {
    name: 'flag_failure',
    title: 'Flag job failure',
    description: 'Mark a queued or filled job as failed when the workflow cannot safely continue.',
    schema: z.object(flagFailureShape),
    execute: async (input) => flagFailureTool(z.object(flagFailureShape).parse(input))
  },
  {
    name: 'fill_application',
    title: 'Fill application',
    description: 'Open a visible browser and fill standard application fields. Never submit the application; the user reviews and submits manually.',
    schema: z.object(fillApplicationShape),
    execute: async (input) => fillApplicationTool(z.object(fillApplicationShape).parse(input))
  },
  {
    name: 'exclude_job',
    title: 'Exclude job',
    description: 'Permanently exclude a posting only when the user explicitly asks to hide, blacklist, or exclude it.',
    schema: z.object(excludeJobShape),
    execute: async (input) => excludeJobTool(z.object(excludeJobShape).parse(input))
  },
  {
    name: 'add_company_board',
    title: 'Track company ATS board',
    description: 'Add a company Greenhouse, Lever, Ashby, or Workday board to future searches.',
    schema: z.object(addCompanyBoardShape),
    execute: async (input) => addCompanyBoardTool(z.object(addCompanyBoardShape).parse(input))
  },
  {
    name: 'list_company_boards',
    title: 'List company ATS boards',
    description: 'List company ATS boards that Applyer currently tracks.',
    schema: z.object(listCompanyBoardsShape),
    execute: async (input) => listCompanyBoardsTool(z.object(listCompanyBoardsShape).parse(input))
  }
] as const

export function getAiTool(name: string): AiToolDefinition | undefined {
  return AI_TOOLS.find((tool) => tool.name === name)
}

export function aiToolJsonSchema(tool: AiToolDefinition): Record<string, unknown> {
  const schema = z.toJSONSchema(tool.schema) as Record<string, unknown>
  const { $schema: _ignored, ...withoutMeta } = schema
  return withoutMeta
}
