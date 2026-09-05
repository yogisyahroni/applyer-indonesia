export const AI_MODES = ['cli', 'openai', 'anthropic', 'openai_compatible'] as const
export type AiMode = (typeof AI_MODES)[number]

export type AiSecretPersistence = 'encrypted' | 'memory' | 'none'

export interface AiConfigSnapshot {
  mode: AiMode
  model: string
  baseUrl: string
  apiKeyConfigured: boolean
  apiKeyPersistence: AiSecretPersistence
}

export interface AiConfigUpdate {
  mode: AiMode
  model: string
  baseUrl: string
  /**
   * Optional replacement secret. Omit it to keep the currently stored key.
   * An empty string is treated the same as omission; use clearApiKey to remove it.
   */
  apiKey?: string
}

export interface AiConnectionTestResult {
  success: boolean
  message: string
  latencyMs?: number
  model?: string
}

export interface AiToolTrace {
  name: string
  ok: boolean
  summary: string
}

export interface AiAgentRunResult {
  success: boolean
  output?: string
  error?: string
  toolTrace: AiToolTrace[]
}

export const DEFAULT_AI_CONFIG: Omit<AiConfigSnapshot, 'apiKeyConfigured' | 'apiKeyPersistence'> = {
  mode: 'cli',
  model: '',
  baseUrl: ''
}

export const AI_DEFAULT_BASE_URLS: Record<Exclude<AiMode, 'cli'>, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openai_compatible: 'http://127.0.0.1:1234/v1'
}

export function isAiMode(value: unknown): value is AiMode {
  return typeof value === 'string' && (AI_MODES as readonly string[]).includes(value)
}
