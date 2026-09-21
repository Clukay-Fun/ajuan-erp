import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo } from '@shared/ipc'
import type { IpcResult } from '@shared/types'
import type { Db } from './db/connection'
import { toAppError } from './services/errors'
import { getProduct, updateProduct } from './services/products'
import { getStock } from './services/inventory'
import { createOpening, getOpening } from './services/opening'
import {
  listDocuments, getDocument, createDraft, updateDraft, deleteDraft, confirmDocument, voidDocument, findDuplicateOrder
} from './services/documents'
import { listChannels, createChannel, updateChannel } from './services/channels'
import { listMovements } from './services/movements'
import { getOverview, getSummary } from './services/reports'

const isDev = !app.isPackaged

// 只接受来自本应用窗口的 IPC 请求。
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const ok = url.startsWith('file://') || (isDev && !!devUrl && url.startsWith(devUrl))
  if (!ok) throw new Error(`Untrusted IPC sender: ${url}`)
}

/** 注册一个通道：校验来源、执行、把异常转成 IpcResult 而不是让 Electron 吞掉错误信息。 */
function handle<T>(channel: string, fn: (...args: any[]) => T): void {
  ipcMain.handle(channel, (event, ...args): IpcResult<T> => {
    try {
      assertTrustedSender(event)
      return { ok: true, data: fn(...args) }
    } catch (err) {
      if (isDev) console.error(`[ipc] ${channel} failed:`, err)
      return { ok: false, error: toAppError(err) }
    }
  })
}

export function registerIpc(db: Db, dbPath: string): void {
  handle<AppInfo>(IPC.appGetInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    dbPath
  }))
  handle(IPC.productsGet, () => getProduct(db))
  handle(IPC.productsUpdate, (input) => updateProduct(db, input))
  handle(IPC.inventoryGetStock, (skuId: number) => getStock(db, skuId))
  handle(IPC.openingGet, (skuId: number) => getOpening(db, skuId))
  handle(IPC.openingCreate, (input) => createOpening(db, input))
  handle(IPC.documentsList, (filter) => listDocuments(db, filter ?? {}))
  handle(IPC.documentsGet, (id: number) => getDocument(db, id))
  handle(IPC.documentsCreateDraft, (input) => createDraft(db, input))
  handle(IPC.documentsUpdateDraft, (id: number, input) => updateDraft(db, id, input))
  handle(IPC.documentsDeleteDraft, (id: number) => deleteDraft(db, id))
  handle(IPC.documentsConfirm, (id: number) => confirmDocument(db, id))
  handle(IPC.documentsVoid, (id: number, reason: string) => voidDocument(db, id, String(reason ?? '')))
  handle(IPC.documentsFindDuplicate, (channelId: number | null, no: string, excludeId: number | null) =>
    findDuplicateOrder(db, channelId, String(no ?? ''), excludeId)
  )
  handle(IPC.channelsList, () => listChannels(db))
  handle(IPC.channelsCreate, (input) => createChannel(db, input))
  handle(IPC.channelsUpdate, (id: number, input) => updateChannel(db, id, input))
  handle(IPC.inventoryListMovements, (filter) => listMovements(db, filter ?? {}))
  handle(IPC.overviewGet, () => getOverview(db))
  handle(IPC.summaryGet, (range) => getSummary(db, range))
}
