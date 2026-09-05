import { readFileSync, writeFileSync } from 'node:fs'

function patch(path, transform) {
  const before = readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`No changes made to ${path}`)
  writeFileSync(path, after)
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle)
  if (first < 0) throw new Error(`Could not find ${label}`)
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Found multiple ${label}`)
  return source.slice(0, first) + replacement + source.slice(first + needle.length)
}

patch('src/preload/index.ts', (source) => {
  source = replaceOnce(
    source,
    "import type { AccountConnectionStatus, AccountProvider } from '@shared/types/accountConnection'",
    "import type { AccountConnectionStatus, AccountProvider } from '@shared/types/accountConnection'\nimport type { AiAgentRunResult, AiConfigSnapshot, AiConfigUpdate, AiConnectionTestResult } from '@shared/types/ai'",
    'preload AI type import anchor'
  )

  const accountBlock = `const accountConnectionsApi = {
  list: (): Promise<{ accounts: AccountConnectionStatus[] }> => ipcRenderer.invoke(IPC.accountConnections.list),
  begin: (
    provider: AccountProvider
  ): Promise<{ ok: true; account: AccountConnectionStatus } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.accountConnections.begin, { provider }),
  save: (
    provider: AccountProvider
  ): Promise<{ ok: true; account: AccountConnectionStatus } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.accountConnections.save, { provider }),
  cancel: (provider: AccountProvider): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.accountConnections.cancel, { provider }),
  disconnect: (
    provider: AccountProvider
  ): Promise<{ ok: true; account: AccountConnectionStatus } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.accountConnections.disconnect, { provider })
}
`

  const aiBlock = `${accountBlock}
const aiApi = {
  getConfig: (): Promise<AiConfigSnapshot> => ipcRenderer.invoke(IPC.ai.getConfig),
  saveConfig: (
    config: AiConfigUpdate
  ): Promise<{ ok: true; config: AiConfigSnapshot } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.ai.saveConfig, config),
  clearApiKey: (): Promise<{ ok: true; config: AiConfigSnapshot } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.ai.clearApiKey),
  testConnection: (): Promise<AiConnectionTestResult> => ipcRenderer.invoke(IPC.ai.testConnection),
  runTask: (prompt: string): Promise<AiAgentRunResult> => ipcRenderer.invoke(IPC.ai.runTask, { prompt })
}
`

  source = replaceOnce(source, accountBlock, aiBlock, 'accountConnectionsApi block')
  source = replaceOnce(
    source,
    '  accountConnections: accountConnectionsApi,\n  browserControl: browserControlApi,',
    '  accountConnections: accountConnectionsApi,\n  ai: aiApi,\n  browserControl: browserControlApi,',
    'preload API export anchor'
  )
  return source
})

function updateJson(path, mutator) {
  const value = JSON.parse(readFileSync(path, 'utf8'))
  mutator(value)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const enAgent = {
  aiGatewayTitle: 'AI Gateway',
  aiGatewayIntro: 'Choose the primary AI runtime. Keep Agent CLI / MCP for Codex or Claude Code, or run the same Applyer tools directly through an API or compatible endpoint.',
  aiModeLabel: 'Primary AI mode',
  aiModeCli: 'Agent CLI / MCP',
  aiModeCompatible: 'OpenAI-compatible endpoint',
  aiModelLabel: 'Model',
  aiModelPlaceholder: 'Enter the model ID exposed by your provider',
  aiBaseUrlLabel: 'Base URL',
  aiApiKeyLabel: 'API key',
  aiApiKeyConfigured: 'Saved key (leave blank to keep it)',
  aiApiKeyPlaceholder: 'Paste API key',
  aiApiKeyStored: 'An API key is already stored ({{persistence}}). Leave this blank to keep it.',
  aiApiKeyOptional: 'Optional for local/custom endpoints that do not require authentication.',
  aiApiKeyRequired: 'Required by this provider. After saving, the key is never returned to the renderer.',
  aiTest: 'Test connection',
  aiClearKey: 'Clear API key',
  aiSaved: 'AI provider settings saved.',
  aiTestSuccess: 'AI connection succeeded ({{latency}} ms).',
  aiTestFailed: 'AI connection failed: {{message}}',
  aiKeyCleared: 'Saved AI API key cleared.',
  aiSecurityNote: "API keys are encrypted with the operating system's secure storage when available; otherwise they remain memory-only and are never written as plaintext."
}

const idAgent = {
  aiGatewayTitle: 'AI Gateway',
  aiGatewayIntro: 'Pilih runtime AI utama. Tetap pakai Agent CLI / MCP untuk Codex atau Claude Code, atau jalankan tool Applyer yang sama langsung lewat API maupun endpoint kompatibel.',
  aiModeLabel: 'Mode AI utama',
  aiModeCli: 'Agent CLI / MCP',
  aiModeCompatible: 'Endpoint kompatibel OpenAI',
  aiModelLabel: 'Model',
  aiModelPlaceholder: 'Masukkan ID model yang disediakan provider',
  aiBaseUrlLabel: 'Base URL',
  aiApiKeyLabel: 'API key',
  aiApiKeyConfigured: 'Key tersimpan (kosongkan untuk tetap memakai yang lama)',
  aiApiKeyPlaceholder: 'Tempel API key',
  aiApiKeyStored: 'API key sudah tersimpan ({{persistence}}). Kosongkan untuk mempertahankannya.',
  aiApiKeyOptional: 'Opsional untuk endpoint lokal/custom yang tidak membutuhkan autentikasi.',
  aiApiKeyRequired: 'Wajib untuk provider ini. Setelah disimpan, key tidak pernah dikirim kembali ke renderer.',
  aiTest: 'Tes koneksi',
  aiClearKey: 'Hapus API key',
  aiSaved: 'Pengaturan provider AI disimpan.',
  aiTestSuccess: 'Koneksi AI berhasil ({{latency}} ms).',
  aiTestFailed: 'Koneksi AI gagal: {{message}}',
  aiKeyCleared: 'API key AI yang tersimpan sudah dihapus.',
  aiSecurityNote: 'API key dienkripsi dengan secure storage sistem operasi jika tersedia; kalau tidak, hanya disimpan di memori dan tidak pernah ditulis sebagai plaintext.'
}

updateJson('src/renderer/src/i18n/locales/en/settings.json', (value) => {
  value.agent = { ...value.agent, ...enAgent }
})
updateJson('src/renderer/src/i18n/locales/id/settings.json', (value) => {
  value.agent = { ...value.agent, ...idAgent }
})

const enWorkspaceAi = {
  loading: 'Loading AI configuration…',
  cliTitle: 'Direct AI is not active',
  cliDescription: 'Primary AI mode is Agent CLI / MCP. Use the Terminal tab, or switch the AI mode in Settings → Agent.',
  agentTitle: 'Direct AI Agent',
  compatible: 'OpenAI-compatible',
  keyMissing: 'API key not configured',
  result: 'Result',
  error: 'Error',
  toolTrace: 'Tool activity',
  empty: 'Give the agent an instruction below. It can search jobs, inspect details, queue matches, and prepare forms using the same Applyer tools as MCP.',
  promptPlaceholder: 'Example: Find backend roles in Jakarta on JobStreet and queue good matches…',
  run: 'Run',
  safety: 'Applications are never auto-submitted. Login, CAPTCHA, verification, and final submission remain human-controlled.'
}

const idWorkspaceAi = {
  loading: 'Memuat konfigurasi AI…',
  cliTitle: 'Direct AI belum aktif',
  cliDescription: 'Mode AI utama masih Agent CLI / MCP. Pakai tab Terminal, atau ubah mode AI di Pengaturan → Agent.',
  agentTitle: 'Direct AI Agent',
  compatible: 'Kompatibel OpenAI',
  keyMissing: 'API key belum dikonfigurasi',
  result: 'Hasil',
  error: 'Error',
  toolTrace: 'Aktivitas tool',
  empty: 'Kasih instruksi ke agent di bawah. Agent bisa mencari lowongan, membaca detail, mengantrekan yang cocok, dan menyiapkan form lewat tool Applyer yang sama dengan MCP.',
  promptPlaceholder: 'Contoh: Cari lowongan backend di Jakarta dari JobStreet lalu antrekan yang cocok…',
  run: 'Jalankan',
  safety: 'Lamaran tidak pernah dikirim otomatis. Login, CAPTCHA, verifikasi, dan Submit akhir tetap dilakukan manusia.'
}

updateJson('src/renderer/src/i18n/locales/en/workspace.json', (value) => {
  value.dock = { ...value.dock, ai: 'AI Agent' }
  value.ai = enWorkspaceAi
})
updateJson('src/renderer/src/i18n/locales/id/workspace.json', (value) => {
  value.dock = { ...value.dock, ai: 'AI Agent' }
  value.ai = idWorkspaceAi
})

console.log('AI preload and locale wiring patched successfully.')
