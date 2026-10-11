import { app, BrowserWindow, dialog, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PsdAssetKind, PsdBoard } from '@shared/psd'
import type { PsdJobCreateInput, PsdSlotCreateInput, PsdTemplateCreateInput } from '@shared/schemas'
import { state } from './appState'
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

export function createPsdJobInteractive(input: PsdJobCreateInput): PsdBoard {
  createPsdJob(state.db, dirs(), input)
  return board()
}

export function cancelPsdJobInteractive(jobId: number): PsdBoard {
  cancelPsdJob(state.db, dirs(), jobId)
  return board()
}

export function retryPsdJobInteractive(jobId: number): PsdBoard {
  retryPsdJob(state.db, dirs(), jobId)
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
