import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipcEvents'
import { ACCOUNT_PROVIDERS, type AccountProvider } from '@shared/types/accountConnection'
import {
  beginAccountConnection,
  cancelAccountConnection,
  disconnectAccount,
  listAccountConnectionStatuses,
  saveAccountConnection
} from '../browser/accountSessions'

function isProvider(value: unknown): value is AccountProvider {
  return typeof value === 'string' && (ACCOUNT_PROVIDERS as readonly string[]).includes(value)
}

function providerFromPayload(payload: unknown): AccountProvider {
  const provider = (payload as { provider?: unknown } | null)?.provider
  if (!isProvider(provider)) throw new Error('Unsupported account provider.')
  return provider
}

export function registerAccountConnectionsIpc(): void {
  ipcMain.handle(IPC.accountConnections.list, () => ({ accounts: listAccountConnectionStatuses() }))

  ipcMain.handle(IPC.accountConnections.begin, async (_event, payload: unknown) => {
    try {
      const provider = providerFromPayload(payload)
      const account = await beginAccountConnection(provider)
      return { ok: true as const, account }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  ipcMain.handle(IPC.accountConnections.save, async (_event, payload: unknown) => {
    try {
      const provider = providerFromPayload(payload)
      const account = await saveAccountConnection(provider)
      return { ok: true as const, account }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  ipcMain.handle(IPC.accountConnections.cancel, async (_event, payload: unknown) => {
    try {
      const provider = providerFromPayload(payload)
      await cancelAccountConnection(provider)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  ipcMain.handle(IPC.accountConnections.disconnect, async (_event, payload: unknown) => {
    try {
      const provider = providerFromPayload(payload)
      const account = await disconnectAccount(provider)
      return { ok: true as const, account }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })
}
