import { app, shell, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import type { UpdateState } from '@shared/types'
import { getApplicationVersion } from './appVersion'
import { updateErrorState } from './updateErrors'

const { autoUpdater } = electronUpdater
const RELEASES_URL = 'https://github.com/Clukay-Fun/ajuan-erp/releases'
const DEFAULT_AUTO_CHECK = true

let mainWindow: BrowserWindow | null = null
let checking = false
let downloading = false
let state: UpdateState = {
  status: 'idle',
  currentVersion: getApplicationVersion(),
  availableVersion: null,
  releaseNotes: null,
  progress: null,
  lastCheckedAt: null,
  autoCheck: DEFAULT_AUTO_CHECK,
  portable: false,
  message: null
}

function preferencesPath(): string {
  return join(app.getPath('userData'), 'updates.json')
}

function readAutoCheck(): boolean {
  try {
    const value: unknown = JSON.parse(readFileSync(preferencesPath(), 'utf8'))
    if (value && typeof value === 'object' && 'autoCheck' in value && typeof value.autoCheck === 'boolean') {
      return value.autoCheck
    }
  } catch {
    // Missing or invalid preferences use the default.
  }
  return DEFAULT_AUTO_CHECK
}

function writeAutoCheck(enabled: boolean): void {
  try {
    writeFileSync(preferencesPath(), JSON.stringify({ autoCheck: enabled }), 'utf8')
  } catch {
    // A failed preference write should not prevent manual update checks.
  }
}

function emit(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.updateState, { ...state })
  }
}

function patch(next: Partial<UpdateState>): void {
  state = { ...state, ...next }
  emit()
}

function isUpdateable(): boolean {
  return process.platform === 'win32' && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR
}

function normalizeReleaseNotes(notes: unknown): string | null {
  if (typeof notes === 'string') return notes || null
  if (!Array.isArray(notes)) return null
  const normalized = notes
    .map((note) => {
      if (typeof note === 'string') return note
      if (note && typeof note === 'object' && 'note' in note && typeof note.note === 'string') return note.note
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
  return normalized || null
}

function unsupportedMessage(portable: boolean): string {
  return portable
    ? '便携版不支持自动更新，请前往发布页手动下载。'
    : '自动更新仅支持 Windows 安装版；开发版和其他平台请前往发布页手动下载。'
}

function handleUpdateError(error: unknown, fallbackMessage: string): void {
  patch(updateErrorState(error, fallbackMessage))
}

function checkForUpdates(): void {
  if (!isUpdateable()) {
    const portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
    patch({ status: 'unsupported', portable, message: unsupportedMessage(portable) })
    return
  }
  if (checking || downloading) return

  checking = true
  patch({ status: 'checking', message: null })
  void autoUpdater
    .checkForUpdates()
    .catch((error: unknown) => handleUpdateError(error, '检查更新失败'))
    .finally(() => {
      checking = false
    })
}

export function initUpdater(window: BrowserWindow): void {
  mainWindow = window
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
  state = {
    ...state,
    currentVersion: getApplicationVersion(),
    autoCheck: readAutoCheck(),
    portable
  }

  if (!isUpdateable()) {
    patch({ status: 'unsupported', message: unsupportedMessage(portable) })
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.on('checking-for-update', () => patch({ status: 'checking', message: null }))
  autoUpdater.on('update-available', (info) =>
    patch({
      status: 'available',
      availableVersion: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      lastCheckedAt: Date.now(),
      progress: null,
      message: null
    })
  )
  autoUpdater.on('update-not-available', (info) =>
    patch({
      status: 'up-to-date',
      availableVersion: info.version ?? null,
      releaseNotes: null,
      lastCheckedAt: Date.now(),
      progress: null,
      message: null
    })
  )
  autoUpdater.on('download-progress', (progress) =>
    patch({ status: 'downloading', progress: Math.floor(progress.percent), message: null })
  )
  autoUpdater.on('update-downloaded', () =>
    patch({ status: 'downloaded', progress: 100, lastCheckedAt: Date.now(), message: null })
  )
  autoUpdater.on('error', (error) => handleUpdateError(error, '更新过程出错'))

  if (state.autoCheck) setTimeout(checkForUpdates, 5000)
}

export const updateApi = {
  getState: (): UpdateState => ({ ...state }),

  setAutoCheck(enabled: boolean): UpdateState {
    const autoCheck = Boolean(enabled)
    writeAutoCheck(autoCheck)
    patch({ autoCheck })
    return { ...state }
  },

  check(): void {
    checkForUpdates()
  },

  download(): void {
    if (!isUpdateable() || downloading || state.status !== 'available') return
    downloading = true
    patch({ status: 'downloading', progress: 0, message: null })
    void autoUpdater
      .downloadUpdate()
      .catch((error: unknown) => handleUpdateError(error, '下载更新失败'))
      .finally(() => {
        downloading = false
      })
  },

  install(): void {
    if (isUpdateable() && state.status === 'downloaded') autoUpdater.quitAndInstall(true)
  },

  async openReleases(): Promise<void> {
    await shell.openExternal(RELEASES_URL)
  }
}
