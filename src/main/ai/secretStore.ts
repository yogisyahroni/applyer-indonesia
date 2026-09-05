import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AiMode, AiSecretPersistence } from '@shared/types/ai'

type DirectAiMode = Exclude<AiMode, 'cli'>

type SecretMap = Partial<Record<DirectAiMode, string>>

const volatileSecrets = new Map<DirectAiMode, string>()

function secretsDir(): string {
  const dir = join(app.getPath('userData'), 'secrets')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

function secretsPath(): string {
  return join(secretsDir(), 'ai-api-keys.enc')
}

function readEncryptedSecrets(): SecretMap {
  const path = secretsPath()
  if (!existsSync(path)) return {}
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable, so saved AI credentials cannot be decrypted.')
  }
  const encrypted = readFileSync(path)
  const decrypted = safeStorage.decryptString(encrypted)
  const parsed: unknown = JSON.parse(decrypted)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const record = parsed as Record<string, unknown>
  const output: SecretMap = {}
  for (const mode of ['openai', 'anthropic', 'openai_compatible'] as const) {
    if (typeof record[mode] === 'string' && record[mode].trim()) output[mode] = record[mode]
  }
  return output
}

function writeEncryptedSecrets(secrets: SecretMap): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const path = secretsPath()
  const encrypted = safeStorage.encryptString(JSON.stringify(secrets))
  writeFileSync(path, encrypted, { mode: 0o600 })
  return true
}

export function getAiApiKey(mode: DirectAiMode): string | null {
  const volatile = volatileSecrets.get(mode)
  if (volatile) return volatile
  const stored = readEncryptedSecrets()[mode]
  return stored ?? null
}

export function setAiApiKey(mode: DirectAiMode, apiKey: string): AiSecretPersistence {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('API key cannot be empty.')

  volatileSecrets.set(mode, trimmed)
  if (!safeStorage.isEncryptionAvailable()) return 'memory'

  const secrets = readEncryptedSecrets()
  secrets[mode] = trimmed
  writeEncryptedSecrets(secrets)
  return 'encrypted'
}

export function clearAiApiKey(mode: DirectAiMode): void {
  volatileSecrets.delete(mode)
  if (!safeStorage.isEncryptionAvailable()) return

  const path = secretsPath()
  if (!existsSync(path)) return
  const secrets = readEncryptedSecrets()
  delete secrets[mode]
  if (Object.keys(secrets).length === 0) unlinkSync(path)
  else writeEncryptedSecrets(secrets)
}

export function getAiApiKeyStatus(mode: DirectAiMode): { configured: boolean; persistence: AiSecretPersistence } {
  if (volatileSecrets.has(mode)) {
    return {
      configured: true,
      persistence: safeStorage.isEncryptionAvailable() ? 'encrypted' : 'memory'
    }
  }

  try {
    const key = readEncryptedSecrets()[mode]
    return key
      ? { configured: true, persistence: 'encrypted' }
      : { configured: false, persistence: 'none' }
  } catch {
    return { configured: false, persistence: 'none' }
  }
}
