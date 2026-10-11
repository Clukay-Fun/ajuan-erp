import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import AdmZip from 'adm-zip'
import { openDatabase, type Db } from '../src/main/db/connection'
import { runMigrations } from '../src/main/db/migrations'
import { createOpening } from '../src/main/services/opening'
import { createDraft, confirmDocument, deleteDraft, voidDocument } from '../src/main/services/documents'
import {
  addAttachment,
  listAttachments,
  removeAttachment,
  resolveAttachmentPath
} from '../src/main/services/attachments'
import { createBackup, inspectBackup, restoreBackup } from '../src/main/services/backup'
import { getStock } from '../src/main/services/inventory'

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 1, 2, 3
])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1])
const upload = (bytes: Uint8Array, name = 'a.png', mime = 'image/png') => ({
  fileName: name,
  mime,
  data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
})

let root: string
let db: Db
let paths: { dbPath: string; attachmentsDir: string }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ajuan-test-'))
  paths = { dbPath: join(root, 'data', 'ajuan.db'), attachmentsDir: join(root, 'data', 'attachments') }
  db = openDatabase(paths.dbPath)
  runMigrations(db)
  createOpening(db, { skuId: 1, quantity: 10, unitCostCents: 1000, docDate: '2026-09-01', note: '' })
})
afterEach(() => {
  try {
    db.close()
  } catch {
    /* 部分用例已自行关闭 */
  }
  rmSync(root, { recursive: true, force: true })
})

const draft = () =>
  createDraft(db, {
    type: 'inbound',
    docDate: '2026-09-02',
    channelId: null,
    externalOrderNo: '',
    note: '',
    items: [{ skuId: 1, quantity: 1, unitPriceCents: 1 }]
  })

describe('附件', () => {
  it('按魔数识别类型并落盘到受控目录', () => {
    const d = draft()
    const a = addAttachment(db, paths.attachmentsDir, d.id, upload(PNG, '发货单.png'))
    expect(a).toMatchObject({ documentId: d.id, mime: 'image/png', size: PNG.length, fileName: '发货单.png' })
    expect(a.relPath).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/)
    expect(existsSync(resolveAttachmentPath(paths.attachmentsDir, a.relPath))).toBe(true)
    const b = addAttachment(db, paths.attachmentsDir, d.id, upload(JPG, 'x.png', 'image/png'))
    expect(b.mime).toBe('image/jpeg')
    expect(b.relPath.endsWith('.jpg')).toBe(true)
    expect(listAttachments(db, d.id)).toHaveLength(2)
  })

  it('拒绝非图片、空文件、越界路径、作废单据', () => {
    const d = draft()
    expect(() =>
      addAttachment(
        db,
        paths.attachmentsDir,
        d.id,
        upload(new TextEncoder().encode('<script>alert(1)</script>'), 'x.png')
      )
    ).toThrow(/只支持/)
    expect(() => addAttachment(db, paths.attachmentsDir, d.id, upload(new Uint8Array(0)))).toThrow(/为空/)
    expect(() => addAttachment(db, paths.attachmentsDir, 999, upload(PNG))).toThrow(/不存在/)
    expect(() => resolveAttachmentPath(paths.attachmentsDir, '../../etc/passwd')).toThrow(/非法/)
    const c = confirmDocument(db, d.id)
    voidDocument(db, c.id, 'x')
    expect(() => addAttachment(db, paths.attachmentsDir, c.id, upload(PNG))).toThrow(/作废/)
  })

  it('删除附件删文件；删除草稿连带清理', () => {
    const d = draft()
    const a = addAttachment(db, paths.attachmentsDir, d.id, upload(PNG))
    const full = resolveAttachmentPath(paths.attachmentsDir, a.relPath)
    removeAttachment(db, paths.attachmentsDir, a.id)
    expect(existsSync(full)).toBe(false)
    expect(listAttachments(db, d.id)).toHaveLength(0)
    const b = addAttachment(db, paths.attachmentsDir, d.id, upload(PNG))
    const full2 = resolveAttachmentPath(paths.attachmentsDir, b.relPath)
    deleteDraft(db, d.id, paths.attachmentsDir)
    expect(existsSync(full2)).toBe(false)
    expect(db.prepare('SELECT COUNT(*) AS c FROM attachments').get()).toEqual({ c: 0 })
  })
})

describe('备份与恢复', () => {
  it('备份包含数据库与附件，manifest 哈希正确，可在全新目录恢复', () => {
    const d = confirmDocument(db, draft().id)
    addAttachment(db, paths.attachmentsDir, d.id, upload(PNG, 'p.png'))
    const out = join(root, 'b.zip')
    const m = createBackup(db, paths, '0.1.0', out)
    expect(m).toMatchObject({
      app: 'ajuan-inventory',
      formatVersion: 1,
      schemaVersion: 4,
      counts: { documents: 2, movements: 2, attachments: 1 }
    })
    expect(m.files.map((f) => f.path)).toEqual([
      'ajuan.db',
      expect.stringMatching(/^attachments\/\d{4}\/\d{2}\/.+\.png$/)
    ])
    expect(inspectBackup(out).problems).toEqual([])

    // 全新数据目录恢复
    const fresh = { dbPath: join(root, 'fresh', 'ajuan.db'), attachmentsDir: join(root, 'fresh', 'attachments') }
    const db2 = restoreBackup(out, fresh, join(root, 'trash'))
    try {
      expect(getStock(db2, 1)).toEqual(getStock(db, 1))
      expect(db2.prepare('SELECT COUNT(*) AS c FROM documents').get()).toEqual({ c: 2 })
      const a = listAttachments(db2, d.id)[0]
      expect(existsSync(resolveAttachmentPath(fresh.attachmentsDir, a.relPath))).toBe(true)
    } finally {
      db2.close()
    }
  })

  it('恢复会把现有数据移入回收目录；损坏的备份被拒绝且现有数据不动', () => {
    const out = join(root, 'b.zip')
    createBackup(db, paths, '0.1.0', out)
    // 之后再改动数据
    confirmDocument(db, draft().id)
    expect(getStock(db, 1).quantity).toBe(11)
    db.close()

    // 篡改副本
    const tampered = join(root, 't.zip')
    const z = new AdmZip(out)
    z.updateFile('ajuan.db', Buffer.from('garbage'))
    z.writeZip(tampered)
    expect(inspectBackup(tampered).problems[0]).toMatch(/损坏/)
    expect(() => restoreBackup(tampered, paths, join(root, 'trash'))).toThrow(/损坏/)
    expect(existsSync(paths.dbPath)).toBe(true)

    const restored = restoreBackup(out, paths, join(root, 'trash'))
    try {
      expect(getStock(restored, 1).quantity).toBe(10)
    } finally {
      restored.close()
    }
    const trash = readdirSync(join(root, 'trash'))
    expect(trash).toHaveLength(1)
    expect(existsSync(join(root, 'trash', trash[0], 'ajuan.db'))).toBe(true)
    db = openDatabase(paths.dbPath)
  })

  it('非本应用 / 高版本 / 缺文件 的备份被识别', () => {
    const out = join(root, 'b.zip')
    createBackup(db, paths, '0.1.0', out)
    const z = new AdmZip(out)
    const m = JSON.parse(z.readAsText('manifest.json'))
    m.app = 'other'
    m.schemaVersion = 99
    z.updateFile('manifest.json', Buffer.from(JSON.stringify(m)))
    z.deleteFile('ajuan.db')
    const bad = join(root, 'bad.zip')
    z.writeZip(bad)
    const p = inspectBackup(bad).problems.join('\n')
    expect(p).toMatch(/不是本应用/)
    expect(p).toMatch(/数据库版本 99/)
    expect(p).toMatch(/缺少文件：ajuan.db/)
    writeFileSync(join(root, 'x.zip'), 'nope')
    expect(() => inspectBackup(join(root, 'x.zip'))).toThrow(/zip/)
  })
})
