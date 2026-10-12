import { app, BrowserWindow, dialog, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { PsdAssetKind, PsdBoard } from '@shared/psd'
import type { PsdJobCreateInput, PsdSlotCreateInput, PsdTemplateCreateInput } from '@shared/schemas'
import { state } from './appState'
import {
  backgroundLaunch,
  createLaunchGate,
  darwinPhotoshopPids,
  shouldQuitOwned,
  windowsPhotoshopPids
} from './photoshopProcess'
import { ServiceError } from './services/errors'
import {
  addPsdSlot,
  cancelPsdJob,
  createPsdJob,
  createPsdTemplate,
  deletePsdAsset,
  deletePsdSlot,
  deletePsdTemplate,
  findPhotoshopApp,
  getPsdBoard,
  importPsdAsset,
  photoshopSearchRoots,
  requeueStuckPsdJobs,
  retryPsdJob,
  type PsdPaths
} from './services/psdExport'

const execFileAsync = promisify(execFile)
const psdJobWatchers = new Map<number, NodeJS.Timeout>()
/** 本次由生成任务启动的 Photoshop。任务开始前已经打开的不记录。 */
let ownedPhotoshopPid: number | null = null
const photoshopLaunch = createLaunchGate<{ pid: number | null; startedByUs: boolean }>()

async function photoshopPids(): Promise<number[]> {
  try {
    if (process.platform === 'darwin') {
      const result = await execFileAsync('ps', ['-axo', 'pid=,command='])
      return darwinPhotoshopPids(result.stdout)
    }
    if (process.platform === 'win32') {
      const result = await execFileAsync('tasklist', ['/FO', 'CSV', '/FI', 'IMAGENAME eq Photoshop.exe'])
      return windowsPhotoshopPids(result.stdout)
    }
  } catch {
    return []
  }
  return []
}

async function waitForPhotoshopPid(): Promise<number | null> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const ids = await photoshopPids()
    if (ids.length > 0) return ids[0]
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return null
}

async function quitOwnedPhotoshop(): Promise<void> {
  const ids = await photoshopPids()
  if (!shouldQuitOwned(ownedPhotoshopPid, ids)) {
    ownedPhotoshopPid = null
    return
  }
  const pid = ownedPhotoshopPid
  ownedPhotoshopPid = null
  try {
    if (process.platform === 'darwin') {
      // macOS 这里退出的是整个 Photoshop，不能按进程号退出。任务开始后如果用户正在用这同一个进程，完成时仍会退出。
      await execFileAsync('osascript', ['-e', 'tell application id "com.adobe.Photoshop" to quit'])
    } else if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T'])
    }
  } catch {
    // Photoshop may already have been closed by the user.
  }
}

function owner(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function dirs(): PsdPaths {
  return { assetsDir: state.psdAssetsDir, bridgeDir: state.psdBridgeDir }
}

function pluginDirectory(): string {
  const root = app.isPackaged
    ? join(process.resourcesPath, 'photoshop-plugin')
    : join(app.getAppPath(), 'photoshop-plugin')
  return join(root, 'ajuan-psd')
}

function board(): PsdBoard {
  return getPsdBoard(state.db, dirs(), {
    photoshopPath: findPhotoshopApp(photoshopSearchRoots()),
    pluginDir: pluginDirectory()
  })
}

async function openFolder(path: string): Promise<void> {
  const error = await shell.openPath(path)
  if (error) throw new ServiceError('INTERNAL', `无法打开：${error}`)
}

export function getPsdBoardInteractive(): PsdBoard {
  return board()
}

export async function pickPsdTemplate(): Promise<string | null> {
  const result = await dialog.showOpenDialog(owner()!, {
    title: '选择 PSD 模板',
    filters: [{ name: 'Photoshop', extensions: ['psd'] }],
    properties: ['openFile']
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

export function createPsdTemplateInteractive(input: PsdTemplateCreateInput): PsdBoard {
  createPsdTemplate(state.db, input)
  return board()
}

export function deletePsdTemplateInteractive(templateId: number): PsdBoard {
  deletePsdTemplate(state.db, templateId)
  return board()
}

export function addPsdSlotInteractive(input: PsdSlotCreateInput): PsdBoard {
  addPsdSlot(state.db, input)
  return board()
}

export function deletePsdSlotInteractive(slotId: number): PsdBoard {
  deletePsdSlot(state.db, slotId)
  return board()
}

export async function importPsdAssetInteractive(kind: PsdAssetKind): Promise<PsdBoard | null> {
  const title = kind === 'dog' ? '选择狗图 PNG' : '选择名字图 PNG'
  const result = await dialog.showOpenDialog(owner()!, {
    title,
    filters: [{ name: 'PNG', extensions: ['png'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  importPsdAsset(state.db, dirs(), kind, result.filePaths[0])
  return board()
}

export function deletePsdAssetInteractive(assetId: number): PsdBoard {
  deletePsdAsset(state.db, dirs(), assetId)
  return board()
}

function watchPsdJob(jobId: number, closeWhenFinished: boolean): void {
  if (!closeWhenFinished || psdJobWatchers.has(jobId)) return
  let checks = 0
  const timer = setInterval(() => {
    checks += 1
    try {
      const current = board()
      const active = current.jobs.some((job) => job.status === 'queued' || job.status === 'running')
      const target = current.jobs.find((job) => job.id === jobId)
      if (!target || (!active && target.status !== 'queued' && target.status !== 'running')) {
        clearInterval(timer)
        psdJobWatchers.delete(jobId)
        void quitOwnedPhotoshop()
      } else if (checks >= 900) {
        // 15 分钟后停止观察，留下 Photoshop，避免任务其实还在跑时把它关掉。
        clearInterval(timer)
        psdJobWatchers.delete(jobId)
      }
    } catch {
      if (checks >= 900) {
        clearInterval(timer)
        psdJobWatchers.delete(jobId)
      }
    }
  }, 1000)
  psdJobWatchers.set(jobId, timer)
}

async function launchPhotoshopInBackground(appPath: string): Promise<void> {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    const error = await shell.openPath(appPath)
    if (error) throw new ServiceError('INTERNAL', `无法启动 Photoshop：${error}`)
    return
  }
  const launch = backgroundLaunch(process.platform, appPath)
  await execFileAsync(launch.command, launch.args)
}

async function startPhotoshopForJob(jobId: number): Promise<void> {
  const found = findPhotoshopApp(photoshopSearchRoots())
  if (!found) throw new ServiceError('NOT_FOUND', '没有找到 Photoshop。请先安装 Photoshop 2024 或更新版本。')
  const alreadyRunning = (await photoshopPids()).length > 0
  if (alreadyRunning) {
    watchPsdJob(jobId, false)
    return
  }
  const launched = await photoshopLaunch.run(async () => {
    const again = await photoshopPids()
    if (again.length > 0) return { pid: again[0], startedByUs: false }
    await launchPhotoshopInBackground(found)
    return { pid: await waitForPhotoshopPid(), startedByUs: true }
  })
  if (launched.startedByUs && ownedPhotoshopPid == null) ownedPhotoshopPid = launched.pid
  watchPsdJob(jobId, launched.startedByUs)
}

export async function createPsdJobInteractive(input: PsdJobCreateInput): Promise<PsdBoard> {
  const jobId = createPsdJob(state.db, dirs(), input)
  try {
    // 只在有导出任务时启动。这次若是应用自己启动的 Photoshop，任务完成后才退出。
    await startPhotoshopForJob(jobId)
  } catch (err) {
    console.error('[psd] 自动启动 Photoshop 失败:', err)
  }
  return board()
}

export function cancelPsdJobInteractive(jobId: number): PsdBoard {
  cancelPsdJob(state.db, dirs(), jobId)
  return board()
}

export async function retryPsdJobInteractive(jobId: number): Promise<PsdBoard> {
  retryPsdJob(state.db, dirs(), jobId)
  try {
    await startPhotoshopForJob(jobId)
  } catch (err) {
    console.error('[psd] 自动启动 Photoshop 失败:', err)
  }
  return board()
}

export function syncPsdInteractive(): PsdBoard {
  return board()
}

export function requeuePsdInteractive(): { board: PsdBoard; count: number } {
  const count = requeueStuckPsdJobs(state.db, dirs())
  return { board: board(), count }
}

export async function openPsdBridge(): Promise<void> {
  await openFolder(dirs().bridgeDir)
}

export async function openPsdPlugin(): Promise<void> {
  const dir = pluginDirectory()
  if (!existsSync(dir)) throw new ServiceError('NOT_FOUND', '插件目录不存在')
  await openFolder(dir)
}

export async function openPhotoshopApp(): Promise<void> {
  const found = findPhotoshopApp(photoshopSearchRoots())
  if (!found) throw new ServiceError('NOT_FOUND', '没有找到 Photoshop。请先安装 Photoshop 2024 或更新版本。')
  await openFolder(found)
}

export function revealPsdJob(jobId: number): void {
  const current = board()
  const job = current.jobs.find((item) => item.id === jobId)
  if (!job?.outputPath || !existsSync(job.outputPath)) throw new ServiceError('NOT_FOUND', '输出文件不在了')
  shell.showItemInFolder(job.outputPath)
}
