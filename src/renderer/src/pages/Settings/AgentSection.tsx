import { useEffect, useState, type ReactElement } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import Select from '../../components/ui/Select'
import TextField from '../../components/ui/TextField'
import Button from '../../components/ui/Button'
import { useToast } from '../../components/ui/useToast'
import { useErrorMessage } from '../../i18n/formatError'
import { CLI_LABELS } from '../../components/settings/mcpCliLabels'
import McpCliCard from '../../components/settings/McpCliCard'
import type { AutoStartCommand, McpConfigDetection } from '@shared/types/ipcEvents'
import {
  AI_DEFAULT_BASE_URLS,
  type AiConfigSnapshot,
  type AiMode
} from '@shared/types/ai'

type Preset = 'off' | 'claude' | 'codex' | 'custom'

function presetForCommand(command: string): Preset {
  if (command === '') return 'off'
  if (command === 'claude') return 'claude'
  if (command === 'codex') return 'codex'
  return 'custom'
}

export default function AgentSection(): ReactElement {
  const [savedCommand, setSavedCommand] = useState<AutoStartCommand | null>(null)
  const [preset, setPreset] = useState<Preset>('off')
  const [customCommand, setCustomCommand] = useState('')
  const [saving, setSaving] = useState(false)
  const [detections, setDetections] = useState<McpConfigDetection[] | null>(null)
  const [aiConfig, setAiConfig] = useState<AiConfigSnapshot | null>(null)
  const [aiMode, setAiMode] = useState<AiMode>('cli')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [savingAi, setSavingAi] = useState(false)
  const [testingAi, setTestingAi] = useState(false)
  const { t } = useTranslation('settings')
  const toast = useToast()
  const errorMessage = useErrorMessage()

  useEffect(() => {
    window.api.settings.getAutoStartCommand().then((command) => {
      setSavedCommand(command)
      const derived = presetForCommand(command)
      setPreset(derived)
      if (derived === 'custom') setCustomCommand(command)
    })
    window.api.onboarding.detectMcpConfigs().then(setDetections)
    window.api.ai.getConfig().then((config) => {
      setAiConfig(config)
      setAiMode(config.mode)
      setModel(config.model)
      setBaseUrl(config.baseUrl)
    })
  }, [])

  const save = async (command: string): Promise<void> => {
    setSaving(true)
    const result = await window.api.settings.setAutoStartCommand(command)
    setSaving(false)
    if (result.ok) {
      const finalCommand = result.command ?? command
      setSavedCommand(finalCommand)
      toast.success(
        finalCommand
          ? t('agent.autoStartSet', { command: finalCommand })
          : t('agent.autoStartCleared')
      )
    } else {
      toast.error(result.error ? errorMessage(result.error) : t('agent.autoStartFailed'))
      if (savedCommand !== null) setPreset(presetForCommand(savedCommand))
    }
  }

  const handlePresetChange = (value: string): void => {
    const next = value as Preset
    setPreset(next)
    if (next === 'off') {
      void save('')
    } else if (next === 'claude' || next === 'codex') {
      void save(next)
    }
  }

  const handleCustomSubmit = (): void => {
    void save(customCommand)
  }

  const handleAiModeChange = (value: string): void => {
    const next = value as AiMode
    setAiMode(next)
    if (next === 'cli') {
      setModel('')
      setBaseUrl('')
      setApiKey('')
      return
    }
    setBaseUrl(AI_DEFAULT_BASE_URLS[next])
    setApiKey('')
  }

  const saveAi = async (): Promise<boolean> => {
    setSavingAi(true)
    const result = await window.api.ai.saveConfig({
      mode: aiMode,
      model,
      baseUrl,
      apiKey: apiKey.trim() || undefined
    })
    setSavingAi(false)
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    setAiConfig(result.config)
    setAiMode(result.config.mode)
    setModel(result.config.model)
    setBaseUrl(result.config.baseUrl)
    setApiKey('')
    toast.success(t('agent.aiSaved'))
    return true
  }

  const testAi = async (): Promise<void> => {
    const saved = await saveAi()
    if (!saved || aiMode === 'cli') return
    setTestingAi(true)
    const result = await window.api.ai.testConnection()
    setTestingAi(false)
    if (result.success) {
      toast.success(t('agent.aiTestSuccess', { latency: result.latencyMs ?? 0 }))
    } else {
      toast.error(t('agent.aiTestFailed', { message: result.message }))
    }
  }

  const clearApiKey = async (): Promise<void> => {
    const result = await window.api.ai.clearApiKey()
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setAiConfig(result.config)
    setApiKey('')
    toast.success(t('agent.aiKeyCleared'))
  }

  const customDirty = preset === 'custom' && customCommand.trim() !== (savedCommand ?? '')
  const directMode = aiMode !== 'cli'

  const presetOptions = [
    { value: 'off', label: t('agent.presetOff') },
    { value: 'claude', label: CLI_LABELS.claude },
    { value: 'codex', label: CLI_LABELS.codex },
    { value: 'custom', label: t('agent.presetCustom') }
  ]

  const aiModeOptions = [
    { value: 'cli', label: t('agent.aiModeCli') },
    { value: 'openai', label: 'OpenAI API' },
    { value: 'anthropic', label: 'Anthropic API' },
    { value: 'openai_compatible', label: t('agent.aiModeCompatible') }
  ]

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-text">{t('agent.aiGatewayTitle')}</h2>
          <p className="mt-0.5 text-[12px] text-text-muted">{t('agent.aiGatewayIntro')}</p>
        </div>
        <Select
          label={t('agent.aiModeLabel')}
          options={aiModeOptions}
          value={aiMode}
          onChange={handleAiModeChange}
          disabled={aiConfig === null || savingAi || testingAi}
        />

        {directMode && (
          <div className="flex flex-col gap-3 border border-border-soft bg-canvas p-3">
            <TextField
              label={t('agent.aiModelLabel')}
              placeholder={t('agent.aiModelPlaceholder')}
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={savingAi || testingAi}
            />
            <TextField
              label={t('agent.aiBaseUrlLabel')}
              placeholder="https://provider.example/v1"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              disabled={savingAi || testingAi}
            />
            <TextField
              type="password"
              autoComplete="off"
              label={t('agent.aiApiKeyLabel')}
              placeholder={aiConfig?.apiKeyConfigured ? t('agent.aiApiKeyConfigured') : t('agent.aiApiKeyPlaceholder')}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              hint={
                aiConfig?.apiKeyConfigured
                  ? t('agent.aiApiKeyStored', { persistence: aiConfig.apiKeyPersistence })
                  : aiMode === 'openai_compatible'
                    ? t('agent.aiApiKeyOptional')
                    : t('agent.aiApiKeyRequired')
              }
              disabled={savingAi || testingAi}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveAi()} loading={savingAi} disabled={!model.trim() || !baseUrl.trim()}>
                {t('actions.save', { ns: 'common' })}
              </Button>
              <Button onClick={() => void testAi()} loading={testingAi} disabled={!model.trim() || !baseUrl.trim()}>
                {t('agent.aiTest')}
              </Button>
              {aiConfig?.apiKeyConfigured && (
                <Button onClick={() => void clearApiKey()} disabled={savingAi || testingAi}>
                  {t('agent.aiClearKey')}
                </Button>
              )}
            </div>
            <p className="text-[11px] text-text-faint">{t('agent.aiSecurityNote')}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border-soft pt-5">
        <div>
          <h2 className="text-[13px] font-semibold text-text">{t('agent.autoStartTitle')}</h2>
          <p className="mt-0.5 text-[12px] text-text-muted">
            <Trans
              t={t}
              i18nKey="agent.autoStartIntro"
              values={{ tool: 'applyer' }}
              components={{ 1: <code className="text-text" /> }}
            />
          </p>
        </div>

        <Select
          label={t('agent.autoStartTitle')}
          options={presetOptions}
          value={preset}
          onChange={handlePresetChange}
          disabled={savedCommand === null || saving}
        />

        {preset === 'custom' && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                label={t('agent.commandLabel')}
                placeholder={t('agent.commandPlaceholder')}
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCustomSubmit()
                }}
                disabled={savedCommand === null || saving}
              />
            </div>
            <Button onClick={handleCustomSubmit} loading={saving} disabled={!customDirty}>
              {t('actions.save', { ns: 'common' })}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border-soft pt-5">
        <div>
          <h2 className="text-[13px] font-semibold text-text">{t('agent.connectionsTitle')}</h2>
          <p className="mt-0.5 text-[12px] text-text-muted">{t('agent.connectionsIntro')}</p>
        </div>
        <div className="flex flex-col gap-2">
          {detections === null && <p className="text-[12px] text-text-faint">{t('agent.detecting')}</p>}
          {detections?.map((d) => (
            <McpCliCard key={d.cli} detection={d} />
          ))}
        </div>
      </div>
    </div>
  )
}
