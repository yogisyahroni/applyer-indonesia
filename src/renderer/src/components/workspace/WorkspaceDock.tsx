import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import TerminalGroup from '../terminal/TerminalGroup'
import AiAgentPanel from '../ai/AiAgentPanel'
import LogsPage from '../../pages/Logs/LogsPage'
import type { DockTab } from './workspaceLayout'

const TAB_IDS: DockTab[] = ['terminal', 'ai', 'logs']

/**
 * The bottom dock: terminal, direct AI agent, and activity log as tabs of one
 * height-constrained region rather than separate full pages. All stay mounted
 * across tab switches (CSS visibility, not conditional render) so terminal
 * PTY sessions and in-progress UI state are not destroyed by tab changes.
 */
export default function WorkspaceDock({
  tab,
  onTabChange,
  onHide
}: {
  tab: DockTab
  onTabChange: (tab: DockTab) => void
  onHide: () => void
}): ReactElement {
  const { t } = useTranslation('workspace')

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas-inset">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border-soft bg-canvas px-2">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`h-full cursor-pointer px-2.5 text-[12px] font-medium ${
              tab === id ? 'border-b-2 border-accent text-text' : 'text-text-muted hover:text-text'
            }`}
          >
            {t(`dock.${id}`)}
          </button>
        ))}
        <button
          onClick={onHide}
          title={t('dock.hide')}
          aria-label={t('dock.hide')}
          className="ml-auto flex h-5 w-5 cursor-pointer items-center justify-center text-text-faint hover:text-text"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 7L6 3.5L9.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <div className={tab === 'terminal' ? 'h-full' : 'hidden'}>
          <TerminalGroup />
        </div>
        <div className={tab === 'ai' ? 'h-full' : 'hidden'}>
          <AiAgentPanel />
        </div>
        <div className={tab === 'logs' ? 'h-full' : 'hidden'}>
          <LogsPage />
        </div>
      </div>
    </div>
  )
}
