import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import type { Db } from '../db/connection'
import { nowIso, transaction } from '../db/connection'
import {
  psdAssetKindSchema,
  psdJobCreateSchema,
  psdSlotCreateSchema,
  psdTemplateCreateSchema,
  type PsdJobCreateInput,
  type PsdSlotCreateInput,
  type PsdTemplateCreateInput
} from '@shared/schemas'
import {
  allocateOutputName,
  parseJobFile,
  safeOutputBase,
  type PsdAsset,
  type PsdAssetKind,
  type PsdBoard,
  type PsdJob,
  type PsdJobFile,
  type PsdJobItem,
  type PsdJobStatus,
  type PsdSlot,
  type PsdTemplate
} from '@shared/psd'
import { ServiceError } from './errors'

export interface PsdPaths {
  assetsDir: string
  bridgeDir: string
}

export interface PsdBoardContext {
  photoshopPath: string | null
  pluginDir: string
}

const MAX_PNG_BYTES = 32 * 1024 * 1024
const BRIDGE_FOLDERS = ['inbox', 'staging', 'outputs', 'done', 'failed', 'processing'] as const
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

interface TemplateRow {
  id: number
  name: string
  source_path: string
  created_at: string
}

interface SlotRow {
  id: number
  template_id: number
  slot_key: string
  dog_layer: string
  name_layer: string
  sort_order: number
}

interface AssetRow {
  id: number
  kind: PsdAssetKind
  label: string
  rel_path: string
  width: number
  height: number
  has_alpha: number
  bytes: number
  created_at: string
}

interface JobRow {
  id: number
  template_id: number | null
  template_name: string
  title: string
  status: PsdJobStatus
  output_file: string | null
  output_path: string | null
  error: string | null
  created_at: string
  finished_at: string | null
}

interface ItemRow {
  job_id: number
  slot_key: string
  dog_layer: string
  name_layer: string
  dog_label: string
  name_label: string
  dog_asset_id: number | null
  name_asset_id: number | null
}

export function resolvePsdAssetPath(assetsDir: string, relPath: string): string {
  if (
    !relPath ||
    relPath.includes('..') ||
    relPath.startsWith('/') ||
    relPath.startsWith('\\') ||
    relPath.includes('\\')
  ) {
    throw new ServiceError('VALIDATION', '非法素材路径')
  }
  const root = resolve(assetsDir)
  const full = resolve(root, relPath)
  if (full !== root && !full.startsWith(root + sep)) throw new ServiceError('VALIDATION', '非法素材路径')
  return full
}

export function ensureBridge(bridgeDir: string): void {
  for (const name of BRIDGE_FOLDERS) mkdirSync(join(bridgeDir, name), { recursive: true })
}

export function photoshopSearchRoots(platform = process.platform): string[] {
  if (platform === 'darwin') return ['/Applications']
  if (platform === 'win32') return ['C:\\Program Files\\Adobe', 'C:\\Program Files']
  return []
}

/** 在给定根目录下找版本名排序最后的 Photoshop。`.app` 本身是目录。 */
export function findPhotoshopApp(roots: readonly string[]): string | null {
  const hits: string[] = []
  const consider = (full: string, name: string): void => {
    if (/^Adobe Photoshop .+\.app$/i.test(name) || /^Photoshop\.exe$/i.test(name)) hits.push(full)
  }
  const walk = (dir: string, depth: number): void => {
    let entries: { name: string; isDirectory(): boolean }[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = join(dir, ent.name)
      if (!ent.isDirectory()) {
        consider(full, ent.name)
        continue
      }
      consider(full, ent.name)
      if (depth > 0 && !ent.name.endsWith('.app') && (ent.name === 'Adobe' || ent.name.startsWith('Adobe Photoshop'))) {
        walk(full, depth - 1)
      }
    }
  }
  for (const root of roots) walk(root, 2)
  hits.sort()
  return hits.at(-1) ?? null
}

function readPngInfo(buf: Buffer): { width: number; height: number; hasAlpha: boolean } {
  if (buf.length < 26 || !buf.subarray(0, 8).equals(PNG_SIG) || buf.toString('ascii', 12, 16) !== 'IHDR') {
    throw new ServiceError('VALIDATION', '只支持 PNG')
  }
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const colorType = buf[25]
  if (!width || !height || width > 20000 || height > 20000) throw new ServiceError('VALIDATION', 'PNG 尺寸无效')
  return { width, height, hasAlpha: colorType === 4 || colorType === 6 }
}

function assertTemplateFile(filePath: string): void {
  if (!filePath.toLowerCase().endsWith('.psd')) throw new ServiceError('VALIDATION', '只支持 .psd 模板')
  if (!existsSync(filePath)) throw new ServiceError('NOT_FOUND', 'PSD 文件不存在')
  const stat = statSync(filePath)
  if (!stat.isFile() || stat.size === 0) throw new ServiceError('VALIDATION', 'PSD 文件是空的')
}

function assertOutsideBridge(bridgeDir: string, filePath: string): void {
  const full = resolve(filePath)
  const root = resolve(bridgeDir)
  if (full === root || full.startsWith(root + sep)) {
    throw new ServiceError('VALIDATION', '请选择桥接目录以外的 PSD 模板')
  }
}

function writeAtomic(filePath: string, text: string): void {
  const tmp = `${filePath}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, filePath)
}

function moveFile(from: string, to: string): void {
  mkdirSync(join(to, '..'), { recursive: true })
  if (existsSync(to)) unlinkSync(to)
  renameSync(from, to)
}

function outputPathFor(bridgeDir: string, fileName: string | null): string | null {
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return null
  const root = resolve(bridgeDir, 'outputs')
  const full = resolve(root, fileName)
  if (full !== root && !full.startsWith(root + sep)) return null
  return full
}

function countOf(db: Db, sql: string, ...args: (string | number)[]): number {
  return (db.prepare(sql).get(...args) as { c: number }).c
}

export function createPsdTemplate(db: Db, input: PsdTemplateCreateInput): number {
  const data = psdTemplateCreateSchema.parse(input)
  assertTemplateFile(data.sourcePath)
  const now = nowIso()
  const row = db
    .prepare(`INSERT INTO psd_templates (name, source_path, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id`)
    .get(data.name, resolve(data.sourcePath), now, now) as { id: number }
  return row.id
}

export function deletePsdTemplate(db: Db, templateId: number): void {
  if (!db.prepare(`SELECT id FROM psd_templates WHERE id = ?`).get(templateId)) {
    throw new ServiceError('NOT_FOUND', '模板不存在')
  }
  if (
    countOf(
      db,
      `SELECT COUNT(*) AS c FROM psd_jobs WHERE template_id = ? AND status IN ('queued', 'running')`,
      templateId
    )
  ) {
    throw new ServiceError('VALIDATION', '还有等待中的导出任务，不能删除模板')
  }
  db.prepare(`DELETE FROM psd_templates WHERE id = ?`).run(templateId)
}

export function addPsdSlot(db: Db, input: PsdSlotCreateInput): number {
  const data = psdSlotCreateSchema.parse(input)
  if (!db.prepare(`SELECT id FROM psd_templates WHERE id = ?`).get(data.templateId)) {
    throw new ServiceError('NOT_FOUND', '模板不存在')
  }
  const rows = db
    .prepare(`SELECT slot_key, dog_layer, name_layer FROM psd_slots WHERE template_id = ?`)
    .all(data.templateId) as { slot_key: string; dog_layer: string; name_layer: string }[]
  if (rows.some((row) => row.slot_key === data.slotKey)) throw new ServiceError('VALIDATION', '这个位置编号已经存在')
  const used = new Set(rows.flatMap((row) => [row.dog_layer, row.name_layer]))
  if (used.has(data.dogLayer) || used.has(data.nameLayer)) {
    throw new ServiceError('VALIDATION', '图层名已经用在别的位置上')
  }
  const sort = (
    db
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM psd_slots WHERE template_id = ?`)
      .get(data.templateId) as {
      n: number
    }
  ).n
  const row = db
    .prepare(
      `INSERT INTO psd_slots (template_id, slot_key, dog_layer, name_layer, sort_order) VALUES (?, ?, ?, ?, ?) RETURNING id`
    )
    .get(data.templateId, data.slotKey, data.dogLayer, data.nameLayer, sort) as { id: number }
  db.prepare(`UPDATE psd_templates SET updated_at = ? WHERE id = ?`).run(nowIso(), data.templateId)
  return row.id
}

export function deletePsdSlot(db: Db, slotId: number): void {
  const slot = db.prepare(`SELECT template_id, slot_key FROM psd_slots WHERE id = ?`).get(slotId) as
    { template_id: number; slot_key: string } | undefined
  if (!slot) throw new ServiceError('NOT_FOUND', '位置不存在')
  if (
    countOf(
      db,
      `SELECT COUNT(*) AS c FROM psd_job_items i JOIN psd_jobs j ON j.id = i.job_id
       WHERE j.template_id = ? AND j.status IN ('queued', 'running') AND i.slot_key = ?`,
      slot.template_id,
      slot.slot_key
    )
  ) {
    throw new ServiceError('VALIDATION', '这个位置还有等待中的导出任务')
  }
  db.prepare(`DELETE FROM psd_slots WHERE id = ?`).run(slotId)
}

export function importPsdAsset(db: Db, paths: PsdPaths, kind: PsdAssetKind, sourcePath: string): number {
  const parsedKind = psdAssetKindSchema.parse(kind)
  if (!existsSync(sourcePath)) throw new ServiceError('NOT_FOUND', '素材文件不存在')
  const buf = readFileSync(sourcePath)
  if (buf.length === 0) throw new ServiceError('VALIDATION', '文件为空')
  if (buf.length > MAX_PNG_BYTES) throw new ServiceError('VALIDATION', '图片超过 32MB')
  const info = readPngInfo(buf)
  const rel = `${randomUUID()}.png`
  mkdirSync(paths.assetsDir, { recursive: true })
  const dest = resolvePsdAssetPath(paths.assetsDir, rel)
  writeFileSync(dest, buf)
  try {
    const label = (
      basename(sourcePath)
        .replace(/\.png$/i, '')
        .trim() || '未命名'
    ).slice(0, 64)
    const row = db
      .prepare(
        `INSERT INTO psd_assets (kind, label, rel_path, width, height, has_alpha, bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
      )
      .get(parsedKind, label, rel, info.width, info.height, info.hasAlpha ? 1 : 0, buf.length, nowIso()) as {
      id: number
    }
    return row.id
  } catch (err) {
    if (existsSync(dest)) unlinkSync(dest)
    throw err
  }
}

export function deletePsdAsset(db: Db, paths: PsdPaths, assetId: number): void {
  const row = db.prepare(`SELECT rel_path FROM psd_assets WHERE id = ?`).get(assetId) as
    { rel_path: string } | undefined
  if (!row) throw new ServiceError('NOT_FOUND', '素材不存在')
  if (
    countOf(
      db,
      `SELECT COUNT(*) AS c FROM psd_job_items i JOIN psd_jobs j ON j.id = i.job_id
       WHERE j.status IN ('queued', 'running') AND (i.dog_asset_id = ? OR i.name_asset_id = ?)`,
      assetId,
      assetId
    )
  ) {
    throw new ServiceError('VALIDATION', '这个素材还有等待中的导出任务')
  }
  db.prepare(`DELETE FROM psd_assets WHERE id = ?`).run(assetId)
  const full = resolvePsdAssetPath(paths.assetsDir, row.rel_path)
  if (existsSync(full)) unlinkSync(full)
}

function takenOutputNames(db: Db, paths: PsdPaths): Set<string> {
  const taken = new Set<string>()
  const outputs = join(paths.bridgeDir, 'outputs')
  if (existsSync(outputs)) {
    for (const name of readdirSync(outputs)) taken.add(name)
  }
  const rows = db
    .prepare(
      `SELECT output_file FROM psd_jobs WHERE status IN ('queued', 'running', 'failed') AND output_file IS NOT NULL`
    )
    .all() as { output_file: string }[]
  for (const row of rows) taken.add(row.output_file)
  return taken
}

export function createPsdJob(db: Db, paths: PsdPaths, input: PsdJobCreateInput): number {
  const data = psdJobCreateSchema.parse(input)
  const template = db.prepare(`SELECT id, name, source_path FROM psd_templates WHERE id = ?`).get(data.templateId) as
    { id: number; name: string; source_path: string } | undefined
  if (!template) throw new ServiceError('NOT_FOUND', '模板不存在')
  assertTemplateFile(template.source_path)
  assertOutsideBridge(paths.bridgeDir, template.source_path)

  const slotRows = db
    .prepare(`SELECT * FROM psd_slots WHERE template_id = ? ORDER BY sort_order, id`)
    .all(template.id) as unknown as SlotRow[]
  const slotById = new Map(slotRows.map((slot) => [slot.id, slot]))
  const prepared = data.items.map((item) => {
    const slot = slotById.get(item.slotId)
    if (!slot) throw new ServiceError('VALIDATION', '位置不属于这个模板')
    const dog = db.prepare(`SELECT * FROM psd_assets WHERE id = ?`).get(item.dogAssetId) as AssetRow | undefined
    const name = db.prepare(`SELECT * FROM psd_assets WHERE id = ?`).get(item.nameAssetId) as AssetRow | undefined
    if (!dog || dog.kind !== 'dog') throw new ServiceError('VALIDATION', '请选择狗图')
    if (!name || name.kind !== 'name') throw new ServiceError('VALIDATION', '请选择名字图')
    const dogPath = resolvePsdAssetPath(paths.assetsDir, dog.rel_path)
    const namePath = resolvePsdAssetPath(paths.assetsDir, name.rel_path)
    if (!existsSync(dogPath) || !existsSync(namePath)) throw new ServiceError('NOT_FOUND', '素材文件丢失')
    return { slot, dog, name, dogPath, namePath }
  })
  prepared.sort((a, b) => a.slot.sort_order - b.slot.sort_order || a.slot.id - b.slot.id)

  ensureBridge(paths.bridgeDir)
  const outputFile = allocateOutputName(safeOutputBase(data.title), takenOutputNames(db, paths))
  const createdAt = nowIso()
  const id = transaction(db, () => {
    const row = db
      .prepare(
        `INSERT INTO psd_jobs (template_id, template_name, title, status, output_file, created_at)
         VALUES (?, ?, ?, 'queued', ?, ?) RETURNING id`
      )
      .get(template.id, template.name, data.title, outputFile, createdAt) as { id: number }
    const insertItem = db.prepare(
      `INSERT INTO psd_job_items
        (job_id, slot_key, dog_layer, name_layer, dog_label, name_label, dog_asset_id, name_asset_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const item of prepared) {
      insertItem.run(
        row.id,
        item.slot.slot_key,
        item.slot.dog_layer,
        item.slot.name_layer,
        item.dog.label,
        item.name.label,
        item.dog.id,
        item.name.id
      )
    }
    return row.id
  })

  const staging = join(paths.bridgeDir, 'staging', String(id))
  const inbox = join(paths.bridgeDir, 'inbox', `${id}.json`)
  try {
    mkdirSync(staging, { recursive: true })
    copyFileSync(template.source_path, join(staging, 'template.psd'))
    const spec: PsdJobFile = {
      version: 1,
      id,
      title: data.title,
      templateFile: 'template.psd',
      outputFile,
      replacements: prepared.flatMap((item) => [
        { layerName: item.slot.dog_layer, file: `${item.slot.slot_key}_dog.png` },
        { layerName: item.slot.name_layer, file: `${item.slot.slot_key}_name.png` }
      ])
    }
    for (const item of prepared) {
      copyFileSync(item.dogPath, join(staging, `${item.slot.slot_key}_dog.png`))
      copyFileSync(item.namePath, join(staging, `${item.slot.slot_key}_name.png`))
    }
    parseJobFile(spec)
    writeAtomic(inbox, JSON.stringify(spec, null, 2))
  } catch (err) {
    rmSync(staging, { recursive: true, force: true })
    if (existsSync(inbox)) unlinkSync(inbox)
    const tmp = `${inbox}.${process.pid}.tmp`
    if (existsSync(tmp)) unlinkSync(tmp)
    const message = err instanceof ServiceError ? err.message : err instanceof Error ? err.message : String(err)
    db.prepare(`UPDATE psd_jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).run(
      message,
      nowIso(),
      id
    )
    throw err instanceof ServiceError ? err : new ServiceError('INTERNAL', message)
  }
  return id
}

function applyResult(db: Db, paths: PsdPaths, parsed: PsdJobFile, filePath: string, folder: string): void {
  const row = db.prepare(`SELECT status FROM psd_jobs WHERE id = ?`).get(parsed.id) as
    { status: PsdJobStatus } | undefined
  if (!row || row.status === 'cancelled') return
  if (row.status === 'done' || row.status === 'failed') {
    if (folder !== row.status) moveFile(filePath, join(paths.bridgeDir, row.status, `${parsed.id}.json`))
    return
  }
  if (!parsed.result) {
    if (folder === 'processing' && row.status === 'queued') {
      db.prepare(`UPDATE psd_jobs SET status = 'running' WHERE id = ?`).run(parsed.id)
    }
    return
  }

  let dest: 'done' | 'failed' = 'failed'
  if (parsed.result.ok) {
    const outputPath = outputPathFor(paths.bridgeDir, parsed.result.outputFile)
    if (!outputPath || !existsSync(outputPath)) {
      db.prepare(`UPDATE psd_jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).run(
        '插件报告成功，但输出文件不存在',
        nowIso(),
        parsed.id
      )
    } else {
      db.prepare(
        `UPDATE psd_jobs SET status = 'done', output_path = ?, error = NULL, finished_at = ? WHERE id = ?`
      ).run(outputPath, nowIso(), parsed.id)
      rmSync(join(paths.bridgeDir, 'staging', String(parsed.id)), { recursive: true, force: true })
      dest = 'done'
    }
  } else {
    db.prepare(`UPDATE psd_jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).run(
      parsed.result.error || '导出失败',
      nowIso(),
      parsed.id
    )
  }
  if (folder !== dest) moveFile(filePath, join(paths.bridgeDir, dest, `${parsed.id}.json`))
}

export function syncPsdResults(db: Db, paths: PsdPaths): void {
  ensureBridge(paths.bridgeDir)
  for (const folder of ['processing', 'done', 'failed'] as const) {
    const dir = join(paths.bridgeDir, folder)
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      const full = join(dir, name)
      if (!existsSync(full)) continue
      let parsed: PsdJobFile
      try {
        parsed = parseJobFile(JSON.parse(readFileSync(full, 'utf8')))
      } catch {
        continue
      }
      applyResult(db, paths, parsed, full, folder)
    }
  }
}

export function cancelPsdJob(db: Db, paths: PsdPaths, jobId: number): void {
  const row = db.prepare(`SELECT status FROM psd_jobs WHERE id = ?`).get(jobId) as { status: PsdJobStatus } | undefined
  if (!row) throw new ServiceError('NOT_FOUND', '任务不存在')
  if (row.status !== 'queued') {
    throw new ServiceError(
      'VALIDATION',
      row.status === 'running' ? '插件正在处理这个任务，不能取消' : '这个任务已经结束'
    )
  }
  if (existsSync(join(paths.bridgeDir, 'processing', `${jobId}.json`))) {
    throw new ServiceError('VALIDATION', '插件正在处理这个任务，不能取消')
  }
  const inbox = join(paths.bridgeDir, 'inbox', `${jobId}.json`)
  if (existsSync(inbox)) unlinkSync(inbox)
  rmSync(join(paths.bridgeDir, 'staging', String(jobId)), { recursive: true, force: true })
  db.prepare(`UPDATE psd_jobs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'queued'`).run(
    nowIso(),
    jobId
  )
}

export function retryPsdJob(db: Db, paths: PsdPaths, jobId: number): void {
  const row = db.prepare(`SELECT status FROM psd_jobs WHERE id = ?`).get(jobId) as { status: PsdJobStatus } | undefined
  if (!row) throw new ServiceError('NOT_FOUND', '任务不存在')
  if (row.status !== 'failed') throw new ServiceError('VALIDATION', '只有失败的任务可以重试')
  const staging = join(paths.bridgeDir, 'staging', String(jobId))
  if (!existsSync(staging)) throw new ServiceError('VALIDATION', '任务素材已清理，请重新生成导出任务')
  const failedFile = join(paths.bridgeDir, 'failed', `${jobId}.json`)
  if (!existsSync(failedFile)) throw new ServiceError('VALIDATION', '找不到失败记录，请重新生成导出任务')
  const parsed = parseJobFile(JSON.parse(readFileSync(failedFile, 'utf8')))
  const spec: PsdJobFile = {
    version: parsed.version,
    id: parsed.id,
    title: parsed.title,
    templateFile: parsed.templateFile,
    outputFile: parsed.outputFile,
    replacements: parsed.replacements
  }
  ensureBridge(paths.bridgeDir)
  writeAtomic(join(paths.bridgeDir, 'inbox', `${jobId}.json`), JSON.stringify(spec, null, 2))
  unlinkSync(failedFile)
  db.prepare(`UPDATE psd_jobs SET status = 'queued', error = NULL, finished_at = NULL WHERE id = ?`).run(jobId)
}

export function requeueStuckPsdJobs(db: Db, paths: PsdPaths): number {
  syncPsdResults(db, paths)
  const dir = join(paths.bridgeDir, 'processing')
  if (!existsSync(dir)) return 0
  let count = 0
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const full = join(dir, name)
    let parsed: PsdJobFile
    try {
      parsed = parseJobFile(JSON.parse(readFileSync(full, 'utf8')))
    } catch {
      continue
    }
    if (parsed.result) continue
    ensureBridge(paths.bridgeDir)
    moveFile(full, join(paths.bridgeDir, 'inbox', `${parsed.id}.json`))
    const before = db.prepare(`SELECT status FROM psd_jobs WHERE id = ?`).get(parsed.id) as
      { status: PsdJobStatus } | undefined
    if (before?.status === 'running') {
      db.prepare(`UPDATE psd_jobs SET status = 'queued', error = NULL, finished_at = NULL WHERE id = ?`).run(parsed.id)
      count += 1
    }
  }
  return count
}

function toSlot(row: SlotRow): PsdSlot {
  return {
    id: row.id,
    templateId: row.template_id,
    slotKey: row.slot_key,
    dogLayer: row.dog_layer,
    nameLayer: row.name_layer,
    sortOrder: row.sort_order
  }
}

function toAsset(row: AssetRow): PsdAsset {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    width: row.width,
    height: row.height,
    hasAlpha: row.has_alpha === 1,
    bytes: row.bytes,
    fileUrl: `ajuan-file://psd-assets/${encodeURIComponent(row.rel_path)}`,
    createdAt: row.created_at
  }
}

function toItem(row: ItemRow): PsdJobItem {
  return {
    slotKey: row.slot_key,
    dogLayer: row.dog_layer,
    nameLayer: row.name_layer,
    dogLabel: row.dog_label,
    nameLabel: row.name_label
  }
}

export function getPsdBoard(db: Db, paths: PsdPaths, context: PsdBoardContext): PsdBoard {
  ensureBridge(paths.bridgeDir)
  mkdirSync(paths.assetsDir, { recursive: true })
  syncPsdResults(db, paths)
  const templates = (
    db
      .prepare(`SELECT id, name, source_path, created_at FROM psd_templates ORDER BY id`)
      .all() as unknown as TemplateRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    sourcePath: row.source_path,
    sourceExists: existsSync(row.source_path),
    slots: (
      db
        .prepare(`SELECT * FROM psd_slots WHERE template_id = ? ORDER BY sort_order, id`)
        .all(row.id) as unknown as SlotRow[]
    ).map(toSlot),
    createdAt: row.created_at
  })) satisfies PsdTemplate[]
  const assets = (db.prepare(`SELECT * FROM psd_assets ORDER BY id DESC`).all() as unknown as AssetRow[]).map(toAsset)
  const items = db.prepare(`SELECT * FROM psd_job_items ORDER BY id`).all() as unknown as ItemRow[]
  const itemsByJob = new Map<number, PsdJobItem[]>()
  for (const item of items) {
    const list = itemsByJob.get(item.job_id) ?? []
    list.push(toItem(item))
    itemsByJob.set(item.job_id, list)
  }
  const jobs = (db.prepare(`SELECT * FROM psd_jobs ORDER BY id DESC`).all() as unknown as JobRow[]).map(
    (row): PsdJob => ({
      id: row.id,
      templateId: row.template_id,
      templateName: row.template_name,
      title: row.title,
      status: row.status,
      outputFile: row.output_file,
      outputPath: row.output_path,
      error: row.error,
      items: itemsByJob.get(row.id) ?? [],
      createdAt: row.created_at,
      finishedAt: row.finished_at
    })
  )
  return {
    bridgeDir: paths.bridgeDir,
    pluginDir: context.pluginDir,
    photoshopPath: context.photoshopPath,
    templates,
    assets,
    jobs
  }
}
