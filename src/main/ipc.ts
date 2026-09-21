import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo } from '@shared/ipc'
import type { IpcResult } from '@shared/types'
import type { Db } from './db/connection'
import { toAppError } from './services/errors'
import { getProduct, updateProduct } from './services/products'
import { getStock } from './services/inventory'
import { createOpening, getOpening } from './services/opening'

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
}
