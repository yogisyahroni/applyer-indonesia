import { randomUUID } from 'crypto'
import { writeFileSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import type { Browser, BrowserContext, Page } from 'playwright'
import { getJob, setFilled, setBlocking } from '../db/repositories/jobsRepository'
import { getProfile } from '../db/repositories/profileRepository'
import { listDocuments, readDocumentBytes } from '../db/repositories/documentsRepository'
import { launchHeadedContext } from './browserController'
import { loadAccountStorageState, storeAccountStorageState } from './accountSessions'
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
  | { status: 'paused_login'; jobId: string; taskId: string; provider: AccountProvider; message: string }
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

async function openApplicationPage(page: Page, targetUrl: string): Promise<void> {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // Client-rendered application forms (Ashby, Workday, JobStreet) finish mounting shortly after load.
  await page.waitForTimeout(1500)
}

/**
 * Races the user clicking Resume/Cancel against auto-detecting that a CAPTCHA
 * cleared on its own (polled every 2s) — whichever happens first wins.
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
  if (isGateOpen(taskId)) resumeGate(taskId)
  return outcome
}

/** Same human-in-the-loop gate as CAPTCHA, but the completion signal is leaving the provider's login/checkpoint URL. */
async function waitForLoginResolution(
  taskId: string,
  jobId: string,
  provider: AccountProvider,
  page: Page
): Promise<GateOutcome> {
  const stopSignal = { stopped: false }

  const pollPromise: Promise<GateOutcome> = (async (): Promise<GateOutcome> => {
    while (!stopSignal.stopped) {
      await new Promise((r) => setTimeout(r, 2000))
      if (stopSignal.stopped) break
      if (!isAccountLoginUrl(provider, page.url())) return 'resolved'
    }
    return 'resolved'
  })()

  const outcome = await Promise.race([openGate(taskId, jobId, page), pollPromise])
  stopSignal.stopped = true
  if (isGateOpen(taskId)) resumeGate(taskId)
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

    const { screenshotPath, job } = await withStorageWriteLock(async () => {
      const capturedPath = await captureScreenshot(page, jobId)
      return { screenshotPath: capturedPath, job: setFilled(jobId, { screenshotPath: capturedPath }) }
    })
    broadcastJobUpdate(job)

    // The browser stays open for the user's final review and manual Submit click.
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

async function continueAfterLogin(
  taskId: string,
  jobId: string,
  provider: AccountProvider,
  targetUrl: string,
  page: Page,
  browser: Browser,
  context: BrowserContext,
  profile: ProfileFields
): Promise<void> {
  const outcome = await waitForLoginResolution(taskId, jobId, provider, page)
  if (outcome === 'cancelled') {
    await browser.close().catch(() => {})
    failJob(jobId, 'login_required', `${ACCOUNT_PROVIDER_META[provider].label} login was cancelled or not completed.`)
    return
  }

  if (isAccountLoginUrl(provider, page.url())) {
    await browser.close().catch(() => {})
    failJob(jobId, 'login_required', `Finish signing in to ${ACCOUNT_PROVIDER_META[provider].label} before resuming the application.`)
    return
  }

  try {
    storeAccountStorageState(provider, await context.storageState())
  } catch (err) {
    mcpLogger.warn(`Could not persist ${provider} session: ${String(err)}`)
  }

  broadcastCaptchaResolved({ taskId, jobId })

  try {
    await openApplicationPage(page, targetUrl)
  } catch (err) {
    await browser.close().catch(() => {})
    failJob(jobId, 'form_not_supported', `Failed to open the application page after login: ${String(err)}`)
    return
  }

  if (isAccountLoginUrl(provider, page.url())) {
    await browser.close().catch(() => {})
    failJob(jobId, 'login_required', `${ACCOUNT_PROVIDER_META[provider].label} did not accept the saved session for this application. Sign in again and retry.`)
    return
  }

  const captcha = await detectCaptcha(page)
  if (captcha.blocked) {
    const captchaTaskId = randomUUID()
    setBlocking(jobId, captcha.reason ?? 'captcha_verification', captchaTaskId)
    const updated = getJob(jobId)
    if (updated) broadcastJobUpdate(updated)
    broadcastCaptchaDetected({
      taskId: captchaTaskId,
      jobId,
      jobTitle: updated?.title ?? '',
      company: updated?.company ?? ''
    })
    await page.bringToFront().catch(() => {})
    await continueAfterCaptcha(captchaTaskId, jobId, page, browser, profile)
    return
  }

  await performFill(jobId, page, browser, profile)
}

function markBlocked(jobId: string, reason: string, taskId: string): void {
  setBlocking(jobId, reason, taskId)
  const updated = getJob(jobId)
  if (updated) {
    broadcastJobUpdate(updated)
    broadcastCaptchaDetected({ taskId, jobId, jobTitle: updated.title, company: updated.company })
  }
}

export async function runFillTask(jobId: string): Promise<FillTaskImmediateResult> {
  const job = getJob(jobId)
  if (!job) return failAndReturn(jobId, 'other', 'Job not found.')
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
      mcpLogger.warn(`Saved ${accountProvider} session could not be loaded: ${String(err)}`)
    }
  }

  // Platform-native application flows that require an account start with a real visible login.
  // The user types credentials/2FA/CAPTCHA themselves; Applyer only saves the resulting session.
  if (accountProvider && !storageState && ACCOUNT_PROVIDER_META[accountProvider].requiresSessionForPlatformApply) {
    let browser: Browser
    let context: BrowserContext
    try {
      const headed = await launchHeadedContext()
      browser = headed.browser
      context = headed.context
    } catch (err) {
      return failAndReturn(jobId, 'browser_unavailable', `Couldn't prepare a browser for login: ${String(err)}`)
    }

    const page = await context.newPage()
    try {
      await page.goto(ACCOUNT_PROVIDER_META[accountProvider].loginUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })
      await page.bringToFront().catch(() => {})
    } catch (err) {
      await browser.close().catch(() => {})
      return failAndReturn(jobId, 'login_required', `Couldn't open ${ACCOUNT_PROVIDER_META[accountProvider].label} sign-in: ${String(err)}`)
    }

    const taskId = randomUUID()
    markBlocked(jobId, 'login_required', taskId)
    continueAfterLogin(taskId, jobId, accountProvider, targetUrl, page, browser, context, profile).catch((err) => {
      mcpLogger.error(`Login continuation crashed: ${String(err)}`)
    })

    return {
      status: 'paused_login',
      jobId,
      taskId,
      provider: accountProvider,
      message: `Sign in to ${ACCOUNT_PROVIDER_META[accountProvider].label} in the browser window. Applyer does not read or store your password. After login, the session is saved locally and the application continues automatically; you can also click Resume in the app.`
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

  const page = await context.newPage()
  try {
    await openApplicationPage(page, targetUrl)
  } catch (err) {
    await browser.close().catch(() => {})
    return failAndReturn(jobId, 'form_not_supported', `Failed to open the application page: ${String(err)}`)
  }

  // A provider can invalidate a previously saved session at any time. Instead of failing the
  // job, hand the visible browser to the user, refresh the session after login, and continue.
  if (accountProvider && isAccountLoginUrl(accountProvider, page.url())) {
    const taskId = randomUUID()
    markBlocked(jobId, 'login_required', taskId)
    await page.bringToFront().catch(() => {})
    continueAfterLogin(taskId, jobId, accountProvider, targetUrl, page, browser, context, profile).catch((err) => {
      mcpLogger.error(`Session refresh continuation crashed: ${String(err)}`)
    })

    return {
      status: 'paused_login',
      jobId,
      taskId,
      provider: accountProvider,
      message: `${ACCOUNT_PROVIDER_META[accountProvider].label} asked you to sign in again. Complete login in the visible browser; Applyer will refresh the encrypted session and continue.`
    }
  }

  const captcha = await detectCaptcha(page)
  if (captcha.blocked) {
    const taskId = randomUUID()
    markBlocked(jobId, captcha.reason ?? 'captcha_verification', taskId)
    await page.bringToFront().catch(() => {})

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