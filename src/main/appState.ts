import { app } from 'electron'
import { join } from 'node:path'
import { openDatabase, type Db } from './db/connection'
import { runMigrations } from './db/migrations'

/** 数据库连接是可替换的（恢复备份时会关闭并重新打开），所以放在一个可变的状态对象里。 */
class AppState {
  private _db: Db | null = null

  get dbPath(): string {
    return join(app.getPath('userData'), 'ajuan.db')
  }
  get attachmentsDir(): string {
    return join(app.getPath('userData'), 'attachments')
  }
  get trashDir(): string {
    return join(app.getPath('userData'), 'restore-trash')
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
