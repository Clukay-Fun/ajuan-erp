import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import type { BackupInspection, TrashEntry } from '@shared/types'
import { state } from './appState'
import { createBackup, inspectBackup, readBackupPreferences, restoreBackup } from './services/backup'
import { ServiceError } from './services/errors'

function owner(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** renderer 里外观偏好的 localStorage 键；与 renderer/src/lib/appearance.ts 保持一致 */
const APPEARANCE_STORAGE_KEY = 'ajuan.appearance'

export async function createBackupInteractive(preferences?: unknown): Promise<string | null> {
  const prefs =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? (preferences as Record<string, unknown>)
      : null
  const r = await dialog.showSaveDialog(owner()!, {
    title: '保存备份',
    defaultPath: join(app.getPath('documents'), `阿卷 ERP备份-${stamp()}.zip`),
    filters: [{ name: '阿卷 ERP备份', extensions: ['zip'] }]
  })
  if (r.canceled || !r.filePath) return null
  createBackup(
    state.db,
    { dbPath: state.dbPath, attachmentsDir: state.attachmentsDir },
    app.getVersion(),
    r.filePath,
    prefs
  )
  return r.filePath
}

export async function pickBackupFile(): Promise<string | null> {
  const r = await dialog.showOpenDialog(owner()!, {
    title: '选择备份文件',
    filters: [{ name: '阿卷 ERP备份', extensions: ['zip'] }],
    properties: ['openFile']
  })
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
}

export function inspectBackupFile(path: string): BackupInspection {
  if (typeof path !== 'string' || !path.toLowerCase().endsWith('.zip'))
    throw new ServiceError('VALIDATION', '只支持 .zip 备份文件')
  return inspectBackup(path)
}

/** 关闭当前库 → 恢复 → 接管新连接 → 重新加载窗口。任何失败都会尝试重新打开原库。 */
export function restoreBackupFile(path: string): void {
  inspectBackupFile(path)
  // preferences.json 形如 { appearance: {...} }；目前只有外观一项
  const appearance = readBackupPreferences(path)?.appearance
  const appearanceJson = appearance && typeof appearance === 'object' ? JSON.stringify(appearance) : null
  state.close()
  try {
    const db = restoreBackup(path, { dbPath: state.dbPath, attachmentsDir: state.attachmentsDir }, state.trashDir)
    state.adopt(db)
  } catch (err) {
    state.open()
    throw err
  }
  // 让 renderer 丢弃所有内存状态，重新从新库加载；备份带外观偏好时先写回再重载（读取时会再做校验归一）
  setTimeout(() => {
    const contents = owner()?.webContents
    if (!contents) return
    const write = appearanceJson
      ? contents.executeJavaScript(
          `localStorage.setItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)}, ${JSON.stringify(appearanceJson)})`
        )
      : Promise.resolve()
    void write.catch(() => {}).finally(() => contents.reload())
  }, 50)
}

function dirSize(p: string): number {
  const st = statSync(p)
  if (st.isFile()) return st.size
  return readdirSync(p).reduce((sum, n) => sum + dirSize(join(p, n)), 0)
}

/** 恢复时移入回收目录的历史数据。 */
export function listTrash(): TrashEntry[] {
  if (!existsSync(state.trashDir)) return []
  return readdirSync(state.trashDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const p = join(state.trashDir, d.name)
      return { name: d.name, createdAt: statSync(p).mtime.toISOString(), sizeBytes: dirSize(p) }
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1))
}

export function clearTrash(): void {
  if (existsSync(state.trashDir)) rmSync(state.trashDir, { recursive: true, force: true })
}
