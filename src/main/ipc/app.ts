import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type AppInfo } from '@shared/types/ipcEvents'

export function registerAppIpc(): void {
  ipcMain.handle(
    IPC.app.getInfo,
    (): AppInfo => ({
      version: app.getVersion(),
      isDevBuild: !app.isPackaged,
      userDataDir: app.getPath('userData')
    })
  )
  ipcMain.handle(IPC.app.checkForUpdates, async () => {
    if (!app.isPackaged) return { status: 'dev' as const, version: app.getVersion() }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { status: result?.updateInfo.version === app.getVersion() ? 'none' as const : 'available' as const, version: result?.updateInfo.version ?? null }
    } catch (error) {
      return { status: 'error' as const, error: String(error) }
    }
  })
  ipcMain.handle(IPC.app.downloadUpdate, async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true as const } } catch (error) { return { ok: false as const, error: String(error) } }
  })
  ipcMain.handle(IPC.app.installUpdate, () => { autoUpdater.quitAndInstall(false, true); return { ok: true as const } })
}

export function initializeAutoUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = false
  autoUpdater.on('update-available', (info) => broadcastUpdate({ status: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => broadcastUpdate({ status: 'none', version: app.getVersion() }))
  autoUpdater.on('update-downloaded', (info) => broadcastUpdate({ status: 'downloaded', version: info.version }))
  autoUpdater.on('error', (error) => broadcastUpdate({ status: 'error', error: String(error) }))
  void autoUpdater.checkForUpdates().catch(() => {})
}

function broadcastUpdate(payload: { status: 'available' | 'none' | 'downloaded' | 'error'; version?: string; error?: string }): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC.app.onUpdate, payload)
}
