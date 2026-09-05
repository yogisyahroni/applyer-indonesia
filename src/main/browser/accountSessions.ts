import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Browser, BrowserContext } from 'playwright'
import { launchHeadedContext } from './browserController'
import {
  ACCOUNT_PROVIDERS,
  ACCOUNT_PROVIDER_META,
  type AccountConnectionStatus,
  type AccountProvider
} from '@shared/types/accountConnection'

export type StoredBrowserState = Awaited<ReturnType<BrowserContext['storageState']>>

interface PendingConnection {
  browser: Browser
  context: BrowserContext
}

const pendingConnections = new Map<AccountProvider, PendingConnection>()
const volatileStates = new Map<AccountProvider, { state: StoredBrowserState; updatedAt: string }>()

function sessionsDir(): string {
  const dir = join(app.getPath('userData'), 'account-sessions')
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

function sessionPath(provider: AccountProvider): string {
  return join(sessionsDir(), `${provider}.session`)
}

function readEncryptedState(provider: AccountProvider): StoredBrowserState | null {
  const path = sessionPath(provider)
  if (!existsSync(path)) return null
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable, so the saved account session cannot be decrypted.')
  }
  const encrypted = readFileSync(path)
  const json = safeStorage.decryptString(encrypted)
  return JSON.parse(json) as StoredBrowserState
}

function writeEncryptedState(provider: AccountProvider, state: StoredBrowserState): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const path = sessionPath(provider)
  const encrypted = safeStorage.encryptString(JSON.stringify(state))
  writeFileSync(path, encrypted, { mode: 0o600 })
  return true
}

export function loadAccountStorageState(provider: AccountProvider): StoredBrowserState | null {
  const volatile = volatileStates.get(provider)
  if (volatile) return structuredClone(volatile.state)
  return readEncryptedState(provider)
}

export function getAccountConnectionStatus(provider: AccountProvider): AccountConnectionStatus {
  const volatile = volatileStates.get(provider)
  if (volatile) {
    return {
      provider,
      connected: true,
      persistence: safeStorage.isEncryptionAvailable() ? 'encrypted' : 'memory',
      updatedAt: volatile.updatedAt
    }
  }

  const path = sessionPath(provider)
  if (!existsSync(path)) {
    return { provider, connected: false, persistence: 'none', updatedAt: null }
  }

  try {
    readEncryptedState(provider)
    return {
      provider,
      connected: true,
      persistence: 'encrypted',
      updatedAt: statSync(path).mtime.toISOString()
    }
  } catch (err) {
    return {
      provider,
      connected: false,
      persistence: 'none',
      updatedAt: statSync(path).mtime.toISOString(),
      error: String(err)
    }
  }
}

export function listAccountConnectionStatuses(): AccountConnectionStatus[] {
  return ACCOUNT_PROVIDERS.map(getAccountConnectionStatus)
}

export async function beginAccountConnection(provider: AccountProvider): Promise<AccountConnectionStatus> {
  await cancelAccountConnection(provider)

  const { browser, context } = await launchHeadedContext()
  pendingConnections.set(provider, { browser, context })

  const page = await context.newPage()
  await page.goto(ACCOUNT_PROVIDER_META[provider].loginUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  })
  await page.bringToFront().catch(() => {})

  return getAccountConnectionStatus(provider)
}

export async function saveAccountConnection(provider: AccountProvider): Promise<AccountConnectionStatus> {
  const pending = pendingConnections.get(provider)
  if (!pending) throw new Error(`No ${ACCOUNT_PROVIDER_META[provider].label} login window is currently open.`)

  const state = await pending.context.storageState()
  const updatedAt = new Date().toISOString()
  volatileStates.set(provider, { state, updatedAt })
  writeEncryptedState(provider, state)

  pendingConnections.delete(provider)
  await pending.browser.close().catch(() => {})
  return getAccountConnectionStatus(provider)
}

export async function cancelAccountConnection(provider: AccountProvider): Promise<void> {
  const pending = pendingConnections.get(provider)
  if (!pending) return
  pendingConnections.delete(provider)
  await pending.browser.close().catch(() => {})
}

export async function disconnectAccount(provider: AccountProvider): Promise<AccountConnectionStatus> {
  await cancelAccountConnection(provider)
  volatileStates.delete(provider)
  const path = sessionPath(provider)
  if (existsSync(path)) unlinkSync(path)
  return getAccountConnectionStatus(provider)
}

export async function closeAccountConnectionBrowsers(): Promise<void> {
  const pending = [...pendingConnections.values()]
  pendingConnections.clear()
  await Promise.all(pending.map(({ browser }) => browser.close().catch(() => {})))
}
