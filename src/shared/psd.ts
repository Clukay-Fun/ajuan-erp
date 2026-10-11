import { z } from 'zod'

/** 桥接任务文件版本。插件只接受这一版。 */
export const PSD_JOB_VERSION = 1

export const SLOT_KEY_PATTERN = /^slot_(0[1-9]|[1-9][0-9])$/

export type PsdAssetKind = 'dog' | 'name'
export type PsdJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

const baseName = z
  .string()
  .min(1)
  .max(180)
  .refine((name) => !name.includes('/') && !name.includes('\\') && !name.includes('..'), '文件名不能包含路径')

export const psdJobFileSchema = z.object({
  version: z.literal(PSD_JOB_VERSION),
  id: z.number().int().positive(),
  title: z.string().min(1).max(60),
  templateFile: z.literal('template.psd'),
  outputFile: baseName.refine((name) => name.toLowerCase().endsWith('.psd'), '输出文件必须是 PSD'),
  replacements: z
    .array(
      z.object({
        layerName: z.string().min(1).max(80),
        file: baseName.refine((name) => name.toLowerCase().endsWith('.png'), '素材文件必须是 PNG')
      })
    )
    .min(1),
  result: z
    .object({
      ok: z.boolean(),
      replaced: z.array(z.string()),
      error: z.string().nullable(),
      outputFile: baseName.nullable()
    })
    .optional()
})

export type PsdJobFile = z.infer<typeof psdJobFileSchema>

export function parseJobFile(raw: unknown): PsdJobFile {
  const parsed = psdJobFileSchema.safeParse(raw)
  if (!parsed.success) throw new Error('任务文件无效')
  return parsed.data
}

const FORBIDDEN_NAME = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|'])

function scrubFileName(value: string): string {
  let cleaned = ''
  for (const char of value) {
    cleaned += char.charCodeAt(0) < 32 || FORBIDDEN_NAME.has(char) ? ' ' : char
  }
  return cleaned
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
}

/** 图层名不能包含路径字符或控制字符。 */
export function isSafeLayerName(name: string): boolean {
  if (!name || name.length > 80) return false
  for (const char of name) {
    if (char.charCodeAt(0) < 32 || FORBIDDEN_NAME.has(char)) return false
  }
  return true
}

/** 输出用的文件名主干。去掉路径字符，避免写出桥接目录。 */
export function safeOutputBase(title: string): string {
  return (scrubFileName(title) || 'export').slice(0, 60)
}

export function allocateOutputName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(`${base}.psd`)) return `${base}.psd`
  for (let i = 2; i < 1000; i++) {
    const name = `${base}-${i}.psd`
    if (!used.has(name)) return name
  }
  throw new Error('输出文件名已用尽')
}

export interface PsdSlot {
  id: number
  templateId: number
  slotKey: string
  dogLayer: string
  nameLayer: string
  sortOrder: number
}

export interface PsdTemplate {
  id: number
  name: string
  sourcePath: string
  sourceExists: boolean
  slots: PsdSlot[]
  createdAt: string
}

export interface PsdAsset {
  id: number
  kind: PsdAssetKind
  label: string
  width: number
  height: number
  hasAlpha: boolean
  bytes: number
  fileUrl: string
  createdAt: string
}

export interface PsdJobItem {
  slotKey: string
  dogLayer: string
  nameLayer: string
  dogLabel: string
  nameLabel: string
}

export interface PsdJob {
  id: number
  templateId: number | null
  templateName: string
  title: string
  status: PsdJobStatus
  outputFile: string | null
  outputPath: string | null
  error: string | null
  items: PsdJobItem[]
  createdAt: string
  finishedAt: string | null
}

export interface PsdBoard {
  bridgeDir: string
  pluginDir: string
  photoshopPath: string | null
  templates: PsdTemplate[]
  assets: PsdAsset[]
  jobs: PsdJob[]
}
