import { z } from 'zod'
import {
  LIST_JOBS_MAX_LIMIT,
  SEARCH_JOBS_MAX_LIMIT
} from '@shared/constants'
import { getSettings } from '@shared/settings'

const settings = getSettings()
const MAX_SALARY_INPUT = 10_000_000_000

const jobSourceEnum = z.enum(['greenhouse', 'lever', 'ashby', 'workday', 'linkedin', 'indeed', 'jobstreet', 'generic'])
const jobStatusEnum = z.enum(['queued', 'filled', 'submitted', 'failed'])
const remotePreferenceEnum = z.enum(['remote', 'hybrid', 'onsite', 'no_preference'])

export const searchJobsShape = {
  query: z.string().trim().min(1).max(200),
  location: z.string().trim().max(200).optional(),
  remote: z.boolean().optional(),
  jobType: z.enum(['full_time', 'part_time', 'contract', 'internship']).optional(),
  sources: z.array(jobSourceEnum).optional(),
  limit: z.number().int().min(1).max(SEARCH_JOBS_MAX_LIMIT).optional()
}

export const getJobDetailsShape = {
  url: z.string().trim().url()
}

export const queueJobShape = {
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().min(1).max(300),
  url: z.string().trim().url(),
  location: z.string().trim().max(300).optional(),
  source: z.string().trim().max(50).optional(),
  description: z.string().max(50000).optional(),
  salaryRange: z.string().trim().max(200).optional(),
  matchScore: z.number().int().min(0).max(100).optional(),
  matchReasons: z.array(z.string().trim().max(200)).max(5).optional()
}

export const listJobsShape = {
  status: jobStatusEnum.optional(),
  limit: z.number().int().min(1).max(LIST_JOBS_MAX_LIMIT).optional(),
  offset: z.number().int().min(0).optional()
}

export const flagFailureShape = {
  jobId: z.string().trim().min(1),
  reasonTag: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, 'reasonTag must be lowercase snake_case, 2-40 chars'),
  message: z.string().trim().max(500).optional()
}

export const getProfileShape = {}

export const updateProfileShape = {
  fullName: z.string().trim().max(200).optional(),
  email: z.union([z.literal(''), z.string().trim().email()]).optional(),
  phone: z.string().trim().max(50).optional(),
  location: z.string().trim().max(200).optional(),
  linkedinUrl: z.string().trim().max(500).optional(),
  githubUrl: z.string().trim().max(500).optional(),
  portfolioUrl: z.string().trim().max(500).optional(),
  workAuthorization: z.string().trim().max(200).optional(),
  desiredRoles: z.array(z.string().trim().max(100)).max(20).optional(),
  desiredLocations: z.array(z.string().trim().max(200)).max(20).optional(),
  remotePreference: remotePreferenceEnum.optional(),
  // Indonesia salaries are commonly expressed as full IDR amounts (e.g. 15_000_000/month),
  // so the old 10M ceiling incorrectly rejected perfectly normal preferences.
  salaryMin: z.number().int().min(0).max(MAX_SALARY_INPUT).nullable().optional(),
  salaryMax: z.number().int().min(0).max(MAX_SALARY_INPUT).nullable().optional(),
  salaryCurrency: z.string().trim().max(10).optional(),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  summary: z.string().trim().max(5000).optional(),
  skills: z.array(z.string().trim().max(100)).max(100).optional()
}

export const fillApplicationShape = {
  jobId: z.string().trim().min(1)
}

export const excludeJobShape = {
  url: z.string().trim().url(),
  title: z.string().trim().max(300).optional(),
  company: z.string().trim().max(300).optional(),
  reason: z.string().trim().max(300).optional()
}

const atsProviderEnum = z.enum(['greenhouse', 'lever', 'ashby', 'workday'])

export const addCompanyBoardShape = {
  company: z.string().trim().min(1).max(200),
  provider: atsProviderEnum.optional(),
  token: z.string().trim().min(1).max(100).optional(),
  displayName: z.string().trim().max(200).optional()
}

export const listCompanyBoardsShape = {
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(settings.dangerousMcpListCompanyBoardsMaxLimit).optional(),
  offset: z.number().int().min(0).optional()
}
