import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'
import type { BackupInspection } from '@shared/types'
import { state } from './appState'
import { createBackup, inspectBackup, restoreBackup } from './services/backup'
import { ServiceError } from './services/errors'

function owner(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export async function createBackupInteractive(): Promise<string | null> {
  const r = await dialog.showSaveDialog(owner()!, {
    title: '保存备份',
    defaultPath: join(app.getPath('documents'), `阿卷库存备份-${stamp()}.zip`),
    filters: [{ name: '阿卷库存备份', extensions: ['zip'] }]
  })
  if (r.canceled || !r.filePath) return null
  createBackup(state.db, { dbPath: state.dbPath, attachmentsDir: state.attachmentsDir }, app.getVersion(), r.filePath)
  return r.filePath
}

export async function pickBackupFile(): Promise<string | null> {
  const r = await dialog.showOpenDialog(owner()!, {
    title: '选择备份文件',
    filters: [{ name: '阿卷库存备份', extensions: ['zip'] }],
    properties: ['openFile']
  })
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
}

export function inspectBackupFile(path: string): BackupInspection {
  if (typeof path !== 'string' || !path.toLowerCase().endsWith('.zip')) throw new ServiceError('VALIDATION', '只支持 .zip 备份文件')
  return inspectBackup(path)
}

/** 关闭当前库 → 恢复 → 接管新连接 → 重新加载窗口。任何失败都会尝试重新打开原库。 */
export function restoreBackupFile(path: string): void {
  inspectBackupFile(path)
  state.close()
  try {
    const db = restoreBackup(path, { dbPath: state.dbPath, attachmentsDir: state.attachmentsDir }, state.trashDir)
    state.adopt(db)
  } catch (err) {
    state.open()
    throw err
  }
  // 让 renderer 丢弃所有内存状态，重新从新库加载
  setTimeout(() => owner()?.webContents.reload(), 50)
}
