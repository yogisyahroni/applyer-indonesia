import {
  AI_DEFAULT_BASE_URLS,
  isAiMode,
  type AiConfigSnapshot,
  type AiConfigUpdate,
  type AiMode
} from '@shared/types/ai'
import { getAiProviderSettings, setAiProviderSettings } from '../db/repositories/settingsRepository'
import { clearAiApiKey, getAiApiKey, getAiApiKeyStatus, setAiApiKey } from './secretStore'

type DirectAiMode = Exclude<AiMode, 'cli'>

function isDirectMode(mode: AiMode): mode is DirectAiMode {
  return mode !== 'cli'
}

function normalizeBaseUrl(mode: AiMode, value: string): string {
  if (mode === 'cli') return ''
  const candidate = value.trim() || AI_DEFAULT_BASE_URLS[mode]
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('Base URL must be a valid http:// or https:// URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Base URL must use http:// or https://.')
  }
  return candidate.replace(/\/+$/, '')
}

function normalizeModel(mode: AiMode, value: string): string {
  if (mode === 'cli') return ''
  const model = value.trim()
  if (!model) throw new Error('Model is required for Direct API mode.')
  if (model.length > 200) throw new Error('Model name is too long.')
  return model
}

export function getAiConfigSnapshot(): AiConfigSnapshot {
  const stored = getAiProviderSettings()
  if (!isDirectMode(stored.mode)) {
    return {
      mode: 'cli',
      model: '',
      baseUrl: '',
      apiKeyConfigured: false,
      apiKeyPersistence: 'none'
    }
  }

  const secret = getAiApiKeyStatus(stored.mode)
  return {
    mode: stored.mode,
    model: stored.model,
    baseUrl: stored.baseUrl || AI_DEFAULT_BASE_URLS[stored.mode],
    apiKeyConfigured: secret.configured,
    apiKeyPersistence: secret.persistence
  }
}

export function saveAiConfig(update: AiConfigUpdate): AiConfigSnapshot {
  if (!isAiMode(update.mode)) throw new Error('Unsupported AI mode.')
  const model = normalizeModel(update.mode, update.model)
  const baseUrl = normalizeBaseUrl(update.mode, update.baseUrl)

  setAiProviderSettings({ mode: update.mode, model, baseUrl })
  if (isDirectMode(update.mode) && update.apiKey?.trim()) setAiApiKey(update.mode, update.apiKey)

  return getAiConfigSnapshot()
}

export function clearCurrentAiApiKey(): AiConfigSnapshot {
  const stored = getAiProviderSettings()
  if (isDirectMode(stored.mode)) clearAiApiKey(stored.mode)
  return getAiConfigSnapshot()
}

export function getResolvedDirectAiConfig(): {
  mode: DirectAiMode
  model: string
  baseUrl: string
  apiKey: string | null
} {
  const snapshot = getAiConfigSnapshot()
  if (!isDirectMode(snapshot.mode)) {
    throw new Error('AI mode is set to Agent CLI / MCP. Switch to a Direct API provider first.')
  }
  if (!snapshot.model.trim()) throw new Error('Configure an AI model first.')
  return {
    mode: snapshot.mode,
    model: snapshot.model,
    baseUrl: snapshot.baseUrl,
    apiKey: getAiApiKey(snapshot.mode)
  }
}
