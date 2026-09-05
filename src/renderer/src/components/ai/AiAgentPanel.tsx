import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../ui/Button'
import type { AiAgentRunResult, AiConfigSnapshot } from '@shared/types/ai'

export default function AiAgentPanel(): ReactElement {
  const { t } = useTranslation('workspace')
  const [config, setConfig] = useState<AiConfigSnapshot | null>(null)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<AiAgentRunResult | null>(null)

  useEffect(() => {
    window.api.ai.getConfig().then(setConfig)
  }, [])

  const run = async (): Promise<void> => {
    const trimmed = prompt.trim()
    if (!trimmed || running) return
    setRunning(true)
    setResult(null)
    try {
      const response = await window.api.ai.runTask(trimmed)
      setResult(response)
      setConfig(await window.api.ai.getConfig())
    } finally {
      setRunning(false)
    }
  }

  if (config === null) {
    return <div className="p-3 text-[12px] text-text-faint">{t('ai.loading')}</div>
  }

  if (config.mode === 'cli') {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="max-w-lg text-center">
          <div className="text-[13px] font-semibold text-text">{t('ai.cliTitle')}</div>
          <p className="mt-1 text-[12px] text-text-muted">{t('ai.cliDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-soft bg-canvas px-3 py-2">
        <span className="text-[12px] font-semibold text-text">{t('ai.agentTitle')}</span>
        <span className="text-[11px] text-text-faint">
          {config.mode === 'openai_compatible' ? t('ai.compatible') : config.mode} · {config.model}
        </span>
        {!config.apiKeyConfigured && config.mode !== 'openai_compatible' && (
          <span className="ml-auto text-[11px] text-danger">{t('ai.keyMissing')}</span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {result ? (
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                {result.success ? t('ai.result') : t('ai.error')}
              </div>
              <pre className={`whitespace-pre-wrap break-words text-[12px] ${result.success ? 'text-text' : 'text-danger'}`}>
                {result.success ? result.output : result.error}
              </pre>
            </div>

            {result.toolTrace.length > 0 && (
              <div className="border-t border-border-soft pt-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                  {t('ai.toolTrace')}
                </div>
                <div className="flex flex-col gap-1">
                  {result.toolTrace.map((trace, index) => (
                    <div key={`${trace.name}-${index}`} className="flex gap-2 text-[11px]">
                      <span className={trace.ok ? 'text-success' : 'text-danger'}>{trace.ok ? '✓' : '×'}</span>
                      <span className="shrink-0 font-medium text-text">{trace.name}</span>
                      <span className="min-w-0 truncate text-text-muted" title={trace.summary}>{trace.summary}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-text-faint">{t('ai.empty')}</p>
        )}
      </div>

      <div className="shrink-0 border-t border-border-soft bg-canvas p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void run()
              }
            }}
            placeholder={t('ai.promptPlaceholder')}
            disabled={running}
            rows={3}
            className="min-h-[58px] flex-1 resize-none border border-border bg-canvas-soft px-2 py-1.5 text-[12px] text-text outline-none placeholder:text-text-faint focus:border-accent"
          />
          <Button onClick={() => void run()} loading={running} disabled={!prompt.trim()}>
            {t('ai.run')}
          </Button>
        </div>
        <div className="mt-1 text-[10px] text-text-faint">{t('ai.safety')}</div>
      </div>
    </div>
  )
}
