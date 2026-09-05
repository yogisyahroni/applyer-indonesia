import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/ui/Button'
import Skeleton from '../../components/ui/Skeleton'
import {
  ACCOUNT_PROVIDERS,
  ACCOUNT_PROVIDER_META,
  type AccountConnectionStatus,
  type AccountProvider
} from '@shared/types/accountConnection'

const ID_COPY = {
  intro:
    'Hubungkan akun situs lowongan sekali lewat browser yang terlihat. Applyer tidak menyimpan email, password, kode 2FA, atau CAPTCHA; hanya sesi browser hasil login yang dipakai ulang saat diperlukan.',
  connected: 'Terhubung',
  disconnected: 'Belum terhubung',
  encrypted: 'Sesi disimpan terenkripsi dengan secure storage sistem operasi.',
  memory: 'Secure storage OS tidak tersedia. Sesi hanya disimpan di memori dan hilang saat aplikasi ditutup.',
  none: 'Belum ada sesi tersimpan.',
  connect: 'Hubungkan',
  reconnect: 'Hubungkan ulang',
  save: 'Simpan sesi',
  cancel: 'Batal',
  disconnect: 'Putuskan',
  signingIn: 'Selesaikan login di jendela browser, termasuk 2FA/CAPTCHA jika diminta, lalu klik Simpan sesi.',
  saved: 'Sesi akun berhasil disimpan.',
  disconnectedToast: 'Sesi akun sudah dihapus dari perangkat ini.',
  securityTitle: 'Cara kerja aman',
  security:
    'Search publik tetap dijalankan tanpa cookie akun sebisa mungkin. Sesi login dipakai terutama untuk alur Apply yang memang membutuhkan akun. Jika sesi kedaluwarsa atau situs meminta verifikasi, Applyer berhenti dan meminta Anda menyelesaikannya sendiri.',
  antibot:
    'Login tersimpan membantu mengurangi login berulang, tetapi tidak menjamin situs tidak akan menampilkan verifikasi atau pembatasan. Applyer tidak melewati CAPTCHA atau rate limit.',
  lastUpdated: 'Diperbarui',
  error: 'Gagal memuat sesi'
}

const EN_COPY = {
  intro:
    'Connect job-site accounts once in a visible browser. Applyer never stores your email, password, 2FA code, or CAPTCHA answer; it only reuses the browser session created after you sign in.',
  connected: 'Connected',
  disconnected: 'Not connected',
  encrypted: 'Session is encrypted with the operating system secure storage.',
  memory: 'OS secure storage is unavailable. The session stays in memory only and disappears when the app closes.',
  none: 'No saved session.',
  connect: 'Connect',
  reconnect: 'Reconnect',
  save: 'Save session',
  cancel: 'Cancel',
  disconnect: 'Disconnect',
  signingIn: 'Finish signing in in the browser window, including 2FA/CAPTCHA if requested, then click Save session.',
  saved: 'Account session saved.',
  disconnectedToast: 'Account session removed from this device.',
  securityTitle: 'Safer session flow',
  security:
    'Public search stays account-free wherever possible. The signed-in session is mainly used for Apply flows that actually require an account. If the session expires or verification appears, Applyer pauses and asks you to resolve it yourself.',
  antibot:
    'A saved login reduces repeated sign-ins, but it cannot guarantee a site will never show verification or rate limits. Applyer does not bypass CAPTCHAs or platform limits.',
  lastUpdated: 'Updated',
  error: 'Could not load session'
}

export default function AccountsSection(): ReactElement {
  const { i18n } = useTranslation()
  const copy = i18n.resolvedLanguage?.startsWith('id') ? ID_COPY : EN_COPY
  const [accounts, setAccounts] = useState<AccountConnectionStatus[] | null>(null)
  const [connecting, setConnecting] = useState<AccountProvider | null>(null)
  const [busy, setBusy] = useState<AccountProvider | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const byProvider = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.provider, account])),
    [accounts]
  )

  const refresh = async (): Promise<void> => {
    try {
      const result = await window.api.accountConnections.list()
      setAccounts(result.accounts)
      setError(null)
    } catch (err) {
      setError(`${copy.error}: ${String(err)}`)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const begin = async (provider: AccountProvider): Promise<void> => {
    setBusy(provider)
    setMessage(null)
    setError(null)
    const result = await window.api.accountConnections.begin(provider)
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setConnecting(provider)
    setMessage(copy.signingIn)
  }

  const save = async (provider: AccountProvider): Promise<void> => {
    setBusy(provider)
    setError(null)
    const result = await window.api.accountConnections.save(provider)
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setConnecting(null)
    setMessage(copy.saved)
    await refresh()
  }

  const cancel = async (provider: AccountProvider): Promise<void> => {
    setBusy(provider)
    await window.api.accountConnections.cancel(provider)
    setBusy(null)
    setConnecting(null)
    setMessage(null)
  }

  const disconnect = async (provider: AccountProvider): Promise<void> => {
    setBusy(provider)
    setError(null)
    const result = await window.api.accountConnections.disconnect(provider)
    setBusy(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setConnecting(null)
    setMessage(copy.disconnectedToast)
    await refresh()
  }

  const persistenceText = (status: AccountConnectionStatus): string => {
    if (status.persistence === 'encrypted') return copy.encrypted
    if (status.persistence === 'memory') return copy.memory
    return copy.none
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-5 text-text-muted">{copy.intro}</p>

      <div className="flex flex-col gap-2">
        {accounts === null
          ? ACCOUNT_PROVIDERS.map((provider) => <Skeleton key={provider} className="h-28 w-full" />)
          : ACCOUNT_PROVIDERS.map((provider) => {
              const status = byProvider.get(provider) ?? {
                provider,
                connected: false,
                persistence: 'none' as const,
                updatedAt: null
              }
              const isConnecting = connecting === provider
              return (
                <div key={provider} className="flex flex-col gap-2 border border-border-soft bg-canvas p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-text">
                        {ACCOUNT_PROVIDER_META[provider].label}
                      </div>
                      <div className="mt-0.5 text-[12px] text-text-muted">
                        {status.connected ? copy.connected : copy.disconnected}
                        {status.updatedAt
                          ? ` · ${copy.lastUpdated} ${new Date(status.updatedAt).toLocaleString(i18n.resolvedLanguage ?? 'id-ID')}`
                          : ''}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-text-muted">
                      {status.connected ? '●' : '○'}
                    </span>
                  </div>

                  <p className="text-[11px] leading-4 text-text-muted">{persistenceText(status)}</p>
                  {status.error && <p className="text-[11px] text-danger">{status.error}</p>}

                  <div className="flex flex-wrap gap-2">
                    {isConnecting ? (
                      <>
                        <Button size="sm" variant="primary" loading={busy === provider} onClick={() => void save(provider)}>
                          {copy.save}
                        </Button>
                        <Button size="sm" disabled={busy === provider} onClick={() => void cancel(provider)}>
                          {copy.cancel}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" loading={busy === provider} onClick={() => void begin(provider)}>
                          {status.connected ? copy.reconnect : copy.connect}
                        </Button>
                        {status.connected && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy === provider}
                            onClick={() => void disconnect(provider)}
                          >
                            {copy.disconnect}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
      </div>

      {message && <div className="border border-border-soft bg-canvas-soft p-3 text-[12px] text-text">{message}</div>}
      {error && <div className="border border-danger/40 p-3 text-[12px] text-danger">{error}</div>}

      <div className="border border-border-soft bg-canvas p-3">
        <h2 className="text-[13px] font-semibold text-text">{copy.securityTitle}</h2>
        <p className="mt-1 text-[12px] leading-5 text-text-muted">{copy.security}</p>
        <p className="mt-2 text-[12px] leading-5 text-text-muted">{copy.antibot}</p>
      </div>
    </div>
  )
}
