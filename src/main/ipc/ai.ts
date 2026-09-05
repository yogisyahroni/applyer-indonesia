import { ipcMain } from 'electron'
import { IPC } from '@shared/types/ipcEvents'
import { isAiMode, type AiConfigUpdate } from '@shared/types/ai'
import { clearCurrentAiApiKey, getAiConfigSnapshot, saveAiConfig } from '../ai/config'
import { testAiConnection } from '../ai/testConnection'
import { runAiAgentTask } from '../ai/agentRuntime'
import { logActivity } from '../db/repositories/activityLogRepository'

let agentRunning = false

function parseUpdate(payload: unknown): AiConfigUpdate {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid AI configuration.')
  const value = payload as Record<string, unknown>
  if (!isAiMode(value.mode)) throw new Error('Unsupported AI mode.')
  if (typeof value.model !== 'string') throw new Error('Model must be a string.')
  if (typeof value.baseUrl !== 'string') throw new Error('Base URL must be a string.')
  if (value.apiKey !== undefined && typeof value.apiKey !== 'string') throw new Error('API key must be a string.')
  if (value.model.length > 200) throw new Error('Model name is too long.')
  if (value.baseUrl.length > 1000) throw new Error('Base URL is too long.')
  if (typeof value.apiKey === 'string' && value.apiKey.length > 20_000) throw new Error('API key is too long.')
  return {
    mode: value.mode,
    model: value.model,
    baseUrl: value.baseUrl,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined
  }
}

export function registerAiIpc(): void {
  ipcMain.handle(IPC.ai.getConfig, () => getAiConfigSnapshot())

  ipcMain.handle(IPC.ai.saveConfig, (_event, payload: unknown) => {
    try {
      const config = saveAiConfig(parseUpdate(payload))
      logActivity('info', `AI mode updated: ${config.mode}${config.model ? ` (${config.model})` : ''}`)
      return { ok: true as const, config }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC.ai.clearApiKey, () => {
    try {
      const config = clearCurrentAiApiKey()
      logActivity('info', `AI API key cleared for ${config.mode}`)
      return { ok: true as const, config }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC.ai.testConnection, () => testAiConnection())

  ipcMain.handle(IPC.ai.runTask, async (_event, payload: unknown) => {
    const prompt =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as { prompt?: unknown }).prompt
        : undefined
    if (typeof prompt !== 'string') return { success: false, error: 'Prompt must be a string.', toolTrace: [] }
    if (agentRunning) return { success: false, error: 'Another Direct API agent task is already running.', toolTrace: [] }

    agentRunning = true
    try {
      return await runAiAgentTask(prompt)
    } finally {
      agentRunning = false
    }
  })
}
