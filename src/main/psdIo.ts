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
const photoshopLaunch = createLaunchGate<void>()

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
  const title = kind === 'dog' ? '选择狗图' : '选择名字图'
  const result = await dialog.showOpenDialog(owner()!, {
    title,
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg'] }],
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

async function launchPhotoshopInBackground(appPath: string): Promise<void> {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    const error = await shell.openPath(appPath)
    if (error) throw new ServiceError('INTERNAL', `无法启动 Photoshop：${error}`)
    return
  }
  const launch = backgroundLaunch(process.platform, appPath)
  await execFileAsync(launch.command, launch.args)
}

async function startPhotoshopForJob(): Promise<void> {
  const found = findPhotoshopApp(photoshopSearchRoots())
  if (!found) throw new ServiceError('NOT_FOUND', '没有找到 Photoshop。请先安装 Photoshop 2024 或更新版本。')
  if ((await photoshopPids()).length > 0) return
  await photoshopLaunch.run(async () => {
    const again = await photoshopPids()
    if (again.length > 0) return
    await launchPhotoshopInBackground(found)
    // 保持启动门闩直到宿主进程出现，避免连续创建任务时重复打开 Photoshop。
    await waitForPhotoshopPid()
  })
}

export async function createPsdJobInteractive(input: PsdJobCreateInput): Promise<PsdBoard> {
  createPsdJob(state.db, dirs(), input)
  try {
    // 只在有导出任务时启动。任务完成后保留 Photoshop，让已加载的开发插件继续可用。
    await startPhotoshopForJob()
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
    await startPhotoshopForJob()
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
