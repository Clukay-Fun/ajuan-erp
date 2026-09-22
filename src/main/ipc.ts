import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo } from '@shared/ipc'
import type { IpcResult } from '@shared/types'
import { state } from './appState'
import { toAppError } from './services/errors'
import { getProduct, updateProduct } from './services/products'
import { getStock } from './services/inventory'
import { createOpening, getOpening } from './services/opening'
import {
  listDocuments,
  getDocument,
  createDraft,
  updateDraft,
  deleteDraft,
  confirmDocument,
  voidDocument,
  findDuplicateOrder
} from './services/documents'
import { listChannels, createChannel, updateChannel } from './services/channels'
import { listMovements } from './services/movements'
import { getOverview, getSummary } from './services/reports'
import {
  pickImportFile,
  previewImportFile,
  commitImportFile,
  saveTemplate,
  exportMovements,
  exportSummary,
  exportDocument
} from './csvIo'
import {
  addAttachment,
  listAttachments,
  removeAttachment,
  setProductImage,
  clearProductImage
} from './services/attachments'
import { createAdjustment } from './services/adjustments'
import {
  createBackupInteractive,
  pickBackupFile,
  inspectBackupFile,
  restoreBackupFile,
  listTrash,
  clearTrash
} from './backupIo'

const isDev = !app.isPackaged

// 只接受来自本应用窗口的 IPC 请求。
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? ''
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const ok = url.startsWith('file://') || (isDev && !!devUrl && url.startsWith(devUrl))
  if (!ok) throw new Error(`Untrusted IPC sender: ${url}`)
}

/** 注册一个通道：校验来源、执行、把异常转成 IpcResult 而不是让 Electron 吞掉错误信息。 */
function handle<T>(channel: string, fn: (...args: any[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<T>> => {
    try {
      assertTrustedSender(event)
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      if (isDev) console.error(`[ipc] ${channel} failed:`, err)
      return { ok: false, error: toAppError(err) }
    }
  })
}

export function registerIpc(): void {
  handle<AppInfo>(IPC.appGetInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    dbPath: state.dbPath
  }))
  handle(IPC.productsGet, () => getProduct(state.db))
  handle(IPC.productsUpdate, (input) => updateProduct(state.db, input))
  handle(IPC.inventoryGetStock, (skuId: number) => getStock(state.db, skuId))
  handle(IPC.openingGet, (skuId: number) => getOpening(state.db, skuId))
  handle(IPC.openingCreate, (input) => createOpening(state.db, input))
  handle(IPC.documentsList, (filter) => listDocuments(state.db, filter ?? {}))
  handle(IPC.documentsGet, (id: number) => getDocument(state.db, id))
  handle(IPC.documentsCreateDraft, (input) => createDraft(state.db, input))
  handle(IPC.documentsUpdateDraft, (id: number, input) => updateDraft(state.db, id, input))
  handle(IPC.documentsDeleteDraft, (id: number) => deleteDraft(state.db, id, state.attachmentsDir))
  handle(IPC.documentsConfirm, (id: number) => confirmDocument(state.db, id))
  handle(IPC.documentsVoid, (id: number, reason: string) => voidDocument(state.db, id, String(reason ?? '')))
  handle(IPC.documentsFindDuplicate, (channelId: number | null, no: string, excludeId: number | null) =>
    findDuplicateOrder(state.db, channelId, String(no ?? ''), excludeId)
  )
  handle(IPC.channelsList, () => listChannels(state.db))
  handle(IPC.channelsCreate, (input) => createChannel(state.db, input))
  handle(IPC.channelsUpdate, (id: number, input) => updateChannel(state.db, id, input))
  handle(IPC.inventoryListMovements, (filter) => listMovements(state.db, filter ?? {}))
  handle(IPC.overviewGet, () => getOverview(state.db))
  handle(IPC.summaryGet, (range) => getSummary(state.db, range))
  handle(IPC.csvPickImportFile, () => pickImportFile())
  handle(IPC.csvPreview, (path: string) => previewImportFile(state.db, path))
  handle(IPC.csvCommit, (path: string, ack: boolean) => commitImportFile(state.db, path, ack))
  handle(IPC.csvSaveTemplate, () => saveTemplate())
  handle(IPC.csvExportMovements, (filter) => exportMovements(state.db, filter ?? {}))
  handle(IPC.csvExportSummary, (range) => exportSummary(state.db, range))
  handle(IPC.attachmentsList, (documentId: number) => listAttachments(state.db, documentId))
  handle(IPC.attachmentsAdd, (documentId: number, upload) =>
    addAttachment(state.db, state.attachmentsDir, documentId, upload)
  )
  handle(IPC.attachmentsRemove, (id: number) => removeAttachment(state.db, state.attachmentsDir, id))
  handle(IPC.backupCreate, () => createBackupInteractive())
  handle(IPC.backupPick, () => pickBackupFile())
  handle(IPC.backupInspect, (path: string) => inspectBackupFile(path))
  handle(IPC.backupRestore, (path: string) => restoreBackupFile(path))
  handle(IPC.adjustmentsCreate, (input) => createAdjustment(state.db, input))
  handle(IPC.productsSetImage, (upload) => {
    setProductImage(state.db, state.attachmentsDir, 1, upload)
    return getProduct(state.db)
  })
  handle(IPC.productsClearImage, () => {
    clearProductImage(state.db, state.attachmentsDir, 1)
    return getProduct(state.db)
  })
  handle(IPC.csvExportDocument, (id: number) => exportDocument(state.db, id))
  handle(IPC.backupListTrash, () => listTrash())
  handle(IPC.backupClearTrash, () => clearTrash())
}
