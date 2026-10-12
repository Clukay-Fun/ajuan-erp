import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { app } from 'electron'
import { dirname, join } from 'node:path'
import { openDatabase, type Db } from './db/connection'
import { runMigrations } from './db/migrations'

const isDev = !app.isPackaged

/** 数据库连接是可替换的（恢复备份时会关闭并重新打开），所以放在一个可变的状态对象里。 */
class AppState {
  private _db: Db | null = null

  /** 开发时把测试数据放在项目目录，打包后再回到 Electron 的 userData。 */
  private get dataRoot(): string {
    return isDev ? join(app.getAppPath(), 'data') : app.getPath('userData')
  }

  get dbPath(): string {
    return join(this.dataRoot, 'ajuan.db')
  }
  get attachmentsDir(): string {
    return join(this.dataRoot, 'attachments')
  }
  get psdAssetsDir(): string {
    return join(this.dataRoot, 'psd-assets')
  }
  /**
   * 开发模式放在项目 data 里方便测试；打包应用放在「文稿」里，便于 Photoshop 选择。
   * 旧版本写在 userData 下，这里仍能看到时就搬过去。
   */
  get psdBridgeDir(): string {
    if (isDev) return join(this.dataRoot, 'psd-bridge')
    const next = join(app.getPath('documents'), '阿卷 ERP', 'psd-bridge')
    const prev = join(app.getPath('userData'), 'psd-bridge')
    if (!existsSync(next) && existsSync(prev)) {
      mkdirSync(dirname(next), { recursive: true })
      renameSync(prev, next)
    }
    return next
  }
  get trashDir(): string {
    return join(this.dataRoot, 'restore-trash')
  }
  get db(): Db {
    if (!this._db) throw new Error('数据库未打开')
    return this._db
  }

  open(): void {
    const db = openDatabase(this.dbPath)
    const ran = runMigrations(db)
    if (ran.length) console.log(`[db] applied migrations: ${ran.join(', ')}`)
    this._db = db
  }

  close(): void {
    this._db?.close()
    this._db = null
  }

  /** 恢复备份后接管新连接 */
  adopt(db: Db): void {
    this._db = db
  }
}

export const state = new AppState()
