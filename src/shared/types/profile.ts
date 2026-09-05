export type RemotePreference = 'remote' | 'hybrid' | 'onsite' | 'no_preference'

export type StorageMode = 'encrypted' | 'plaintext'

export type DocumentKind = 'resume' | 'cover_letter' | 'other'

export interface ProfileFields {
  fullName: string
  email: string
  phone: string
  location: string
  linkedinUrl: string
  githubUrl: string
  portfolioUrl: string
  workAuthorization: string
  desiredRoles: string[]
  desiredLocations: string[]
  remotePreference: RemotePreference
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  yearsExperience: number | null
  summary: string
  skills: string[]
}

export interface DocumentSummary {
  id: string
  kind: DocumentKind
  originalFilename: string
  sizeBytes: number
  hasExtractedText: boolean
  createdAt: string
}

export interface ProfileWithDocuments {
  profile: ProfileFields | null
  documents: DocumentSummary[]
}

/**
 * Canonical initial profile for the Indonesia distribution. Personal fields
 * stay empty, while country/currency defaults remove repetitive onboarding
 * work and align with the Indonesia-only search policy.
 */
export const EMPTY_PROFILE: ProfileFields = {
  fullName: '',
  email: '',
  phone: '',
  location: 'Indonesia',
  linkedinUrl: '',
  githubUrl: '',
  portfolioUrl: '',
  workAuthorization: '',
  desiredRoles: [],
  desiredLocations: ['Indonesia'],
  remotePreference: 'no_preference',
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: 'IDR',
  yearsExperience: null,
  summary: '',
  skills: []
}
