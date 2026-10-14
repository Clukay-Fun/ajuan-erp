import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { openDatabase, type Db } from './db/connection'
import { runMigrations } from './db/migrations'

const isDev = !app.isPackaged

/** 数据库连接是可替换的（恢复备份时会关闭并重新打开），所以放在一个可变的状态对象里。 */
class AppState {
  private _db: Db | null = null
  private _psdDirectories: { bridgeDir: string; outputDir: string } | null = null

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
  private get defaultPsdBridgeDir(): string {
    if (isDev) return join(this.dataRoot, 'psd-bridge')
    const next = join(app.getPath('documents'), '阿卷 ERP', 'psd-bridge')
    const prev = join(app.getPath('userData'), 'psd-bridge')
    if (!existsSync(next) && existsSync(prev)) {
      mkdirSync(dirname(next), { recursive: true })
      renameSync(prev, next)
    }
    return next
  }
  private get defaultPsdOutputDir(): string {
    return join(app.getPath('downloads'), '阿卷 ERP')
  }
  private get psdDirectories(): { bridgeDir: string; outputDir: string } {
    if (this._psdDirectories) return this._psdDirectories
    const defaults = { bridgeDir: this.defaultPsdBridgeDir, outputDir: this.defaultPsdOutputDir }
    const settingsPath = join(app.getPath('userData'), 'psd-directories.json')
    try {
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as Partial<typeof defaults>
      this._psdDirectories = {
        bridgeDir:
          typeof parsed.bridgeDir === 'string' && isAbsolute(parsed.bridgeDir)
            ? resolve(parsed.bridgeDir)
            : defaults.bridgeDir,
        outputDir:
          typeof parsed.outputDir === 'string' && isAbsolute(parsed.outputDir)
            ? resolve(parsed.outputDir)
            : defaults.outputDir
      }
    } catch {
      this._psdDirectories = defaults
    }
    return this._psdDirectories
  }
  get psdBridgeDir(): string {
    return this.psdDirectories.bridgeDir
  }
  get psdOutputDir(): string {
    return this.psdDirectories.outputDir
  }
  setPsdDirectory(kind: 'bridgeDir' | 'outputDir', path: string): void {
    if (!isAbsolute(path)) throw new Error('目录必须是绝对路径')
    const directories = { ...this.psdDirectories, [kind]: resolve(path) }
    mkdirSync(directories[kind], { recursive: true })
    const settingsPath = join(app.getPath('userData'), 'psd-directories.json')
    mkdirSync(dirname(settingsPath), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(directories, null, 2), 'utf8')
    this._psdDirectories = directories
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
