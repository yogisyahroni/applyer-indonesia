import { randomUUID } from 'crypto'
import { writeFileSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import type { Browser, BrowserContext, Page } from 'playwright'
import { getJob, setFilled, setBlocking } from '../db/repositories/jobsRepository'
import { getProfile } from '../db/repositories/profileRepository'
import { listDocuments, readDocumentBytes } from '../db/repositories/documentsRepository'
import { launchHeadedContext } from './browserController'
import { loadAccountStorageState } from './accountSessions'
import { detectCaptcha } from './captchaDetector'
import { fillForm } from './formFiller'
import { openGate, resumeGate, isGateOpen, type GateOutcome } from './captchaGate'
import { failJob } from '../jobActions'
import { broadcastJobUpdate, broadcastCaptchaDetected, broadcastCaptchaResolved } from '../ipc/jobsBroadcast'
import { screenshotsDir, tempDir } from '../config/paths'
import { withStorageWriteLock } from '../storageWriteLock'
import { mcpLogger } from '../logger'
import type { ProfileFields } from '@shared/types/profile'
import {
  ACCOUNT_PROVIDER_META,
  accountProviderForUrl,
  isAccountLoginUrl,
  type AccountProvider
} from '@shared/types/accountConnection'

export type FillTaskImmediateResult =
  | { status: 'filled'; jobId: string; screenshotPath: string; filledFields: string[]; skippedFields: string[] }
  | { status: 'paused_captcha'; jobId: string; taskId: string; message: string }
  | { status: 'failed'; jobId: string; reasonTag: string; message: string }

function extensionFor(originalFilename: string): string {
  return extname(originalFilename) || '.bin'
}

function materializeDocument(kind: 'resume' | 'cover_letter'): string | undefined {
  const doc = listDocuments().find((d) => d.kind === kind)
  if (!doc) return undefined
  const bytes = readDocumentBytes(doc.id)
  if (!bytes) return undefined
  const tempPath = join(tempDir(), `${randomUUID()}${extensionFor(doc.originalFilename)}`)
  writeFileSync(tempPath, bytes)
  return tempPath
}

function safeUnlink(path: string | undefined): void {
  if (!path) return
  try {
    unlinkSync(path)
  } catch {
    // best-effort cleanup — not worth failing the task over
  }
}

async function captureScreenshot(page: Page, jobId: string): Promise<string> {
  const path = join(screenshotsDir(), `${jobId}.png`)
  await page.screenshot({ path }).catch(() => {})
  return path
}

function failAndReturn(jobId: string, reasonTag: string, message: string): FillTaskImmediateResult {
  failJob(jobId, reasonTag, message)
  return { status: 'failed', jobId, reasonTag, message }
}

function loginRequiredMessage(provider: AccountProvider, expired = false): string {
  const label = ACCOUNT_PROVIDER_META[provider].label
  return expired
    ? `${label} redirected this application to sign in, so the saved session is no longer valid. Reconnect ${label} in Settings > Accounts, then retry the job.`
    : `${label} requires a signed-in account for this application flow. Connect ${label} in Settings > Accounts first, then retry the job.`
}

/**
 * Races the user clicking Resume/Cancel against auto-detecting that the
 * challenge cleared on its own (polled every 2s) — whichever happens first
 * wins. If auto-detect wins, the manual gate is resolved too so it doesn't
 * linger waiting for a click that will never come.
 */
async function waitForCaptchaResolution(taskId: string, jobId: string, page: Page): Promise<GateOutcome> {
  const stopSignal = { stopped: false }

  const pollPromise: Promise<GateOutcome> = (async (): Promise<GateOutcome> => {
    while (!stopSignal.stopped) {
      await new Promise((r) => setTimeout(r, 2000))
      if (stopSignal.stopped) break
      const check = await detectCaptcha(page).catch(() => ({ blocked: true }) as const)
      if (!check.blocked) return 'resolved'
    }
    return 'resolved'
  })()

  const outcome = await Promise.race([openGate(taskId, jobId, page), pollPromise])
  stopSignal.stopped = true
  if (isGateOpen(taskId)) {
    resumeGate(taskId)
  }
  return outcome
}

async function performFill(
  jobId: string,
  page: Page,
  browser: Browser,
  profile: ProfileFields
): Promise<FillTaskImmediateResult> {
  let resumePath: string | undefined
  let coverLetterPath: string | undefined

  try {
    resumePath = materializeDocument('resume')
    coverLetterPath = materializeDocument('cover_letter')

    const { filledFields, skippedFields } = await fillForm(page, profile, {
      resumeFilePath: resumePath,
      coverLetterFilePath: coverLetterPath
    })

    if (filledFields.length === 0) {
      await browser.close().catch(() => {})
      return failAndReturn(jobId, 'form_not_supported', "Couldn't identify any recognizable fields on this application form. It may need to be filled manually.")
    }

    // Screenshot capture + the DB row it's referenced from are what a
    // storage-location migration's copy-then-snapshot must never race — see
    // storageWriteLock.ts.
    const { screenshotPath, job } = await withStorageWriteLock(async () => {
      const capturedPath = await captureScreenshot(page, jobId)
      return { screenshotPath: capturedPath, job: setFilled(jobId, { screenshotPath: capturedPath }) }
    })
    broadcastJobUpdate(job)

    // The browser window is deliberately left open — the user reviews,
    // edits, and submits it themselves. We never close it out from under them.
    return { status: 'filled', jobId, screenshotPath, filledFields, skippedFields }
  } catch (err) {
    await browser.close().catch(() => {})
    return failAndReturn(jobId, 'other', `Failed while filling the form: ${String(err)}`)
  } finally {
    safeUnlink(resumePath)
    safeUnlink(coverLetterPath)
  }
}

async function continueAfterCaptcha(
  taskId: string,
  jobId: string,
  page: Page,
  browser: Browser,
  profile: ProfileFields
): Promise<void> {
  const outcome = await waitForCaptchaResolution(taskId, jobId, page)
  if (outcome === 'cancelled') {
    await browser.close().catch(() => {})
    failJob(jobId, 'captcha_verification', 'The verification challenge was not resolved in time (or was cancelled).')
    return
  }
  broadcastCaptchaResolved({ taskId, jobId })
  await performFill(jobId, page, browser, profile)
}

export async function runFillTask(jobId: string): Promise<FillTaskImmediateResult> {
  const job = getJob(jobId)
  if (!job) {
    return failAndReturn(jobId, 'other', 'Job not found.')
  }
  if (job.status !== 'queued') {
    return { status: 'failed', jobId, reasonTag: 'other', message: `Job is not in the Queued state (currently: ${job.status}).` }
  }

  const profile = getProfile()
  if (!profile) {
    return { status: 'failed', jobId, reasonTag: 'other', message: 'No profile found; complete onboarding first.' }
  }

  const targetUrl = job.applicationUrl || job.url
  const accountProvider = accountProviderForUrl(targetUrl)
  let storageState: ReturnType<typeof loadAccountStorageState> = null

  if (accountProvider) {
    try {
      storageState = loadAccountStorageState(accountProvider)
    } catch (err) {
      return failAndReturn(
        jobId,
        'login_required',
        `The saved ${ACCOUNT_PROVIDER_META[accountProvider].label} session could not be read: ${String(err)} Reconnect it in Settings > Accounts.`
      )
    }

    if (!storageState && ACCOUNT_PROVIDER_META[accountProvider].requiresSessionForPlatformApply) {
      return failAndReturn(jobId, 'login_required', loginRequiredMessage(accountProvider))
    }
  }

  let browser: Browser
  let context: BrowserContext
  try {
    const headed = await launchHeadedContext({ storageState: storageState ?? undefined })
    browser = headed.browser
    context = headed.context
  } catch (err) {
    return failAndReturn(jobId, 'browser_unavailable', `Couldn't prepare a browser: ${String(err)}`)
  }

  let page: Page
  try {
    page = await context.newPage()
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Client-rendered application forms (Ashby, Workday) finish mounting fields shortly after load.
    await page.waitForTimeout(1500)
  } catch (err) {
    await browser.close().catch(() => {})
    return failAndReturn(jobId, 'form_not_supported', `Failed to open the application page: ${String(err)}`)
  }

  if (accountProvider && storageState && isAccountLoginUrl(accountProvider, page.url())) {
    await browser.close().catch(() => {})
    return failAndReturn(jobId, 'login_required', loginRequiredMessage(accountProvider, true))
  }

  const captcha = await detectCaptcha(page)
  if (captcha.blocked) {
    const taskId = randomUUID()
    setBlocking(jobId, captcha.reason ?? 'captcha_verification', taskId)
    const updated = getJob(jobId)
    if (updated) broadcastJobUpdate(updated)
    broadcastCaptchaDetected({ taskId, jobId, jobTitle: job.title, company: job.company })
    await page.bringToFront().catch(() => {})

    // Deliberately not awaited — the tool call must return now, not block
    // for up to 15 minutes on the user resolving the challenge.
    continueAfterCaptcha(taskId, jobId, page, browser, profile).catch((err) => {
      mcpLogger.error(`Fill task continuation crashed: ${String(err)}`)
    })

    return {
      status: 'paused_captcha',
      jobId,
      taskId,
      message: 'A verification challenge appeared in the browser window; resolve it there, then click Resume in the app (or it will resume automatically once the challenge clears).'
    }
  }

  return performFill(jobId, page, browser, profile)
}