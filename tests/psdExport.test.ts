import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { testDb } from './helpers'
import { allocateOutputName, parseJobFile, safeOutputBase } from '@shared/psd'
import { ServiceError } from '../src/main/services/errors'
import {
  addPsdSlot,
  cancelPsdJob,
  createPsdJob,
  createPsdTemplate,
  deletePsdAsset,
  deletePsdTemplate,
  findPhotoshopApp,
  getPsdBoard,
  importPsdAsset,
  requeueStuckPsdJobs,
  retryPsdJob,
  type PsdPaths
} from '../src/main/services/psdExport'

const require = createRequire(import.meta.url)
const { fitContain } = require('../photoshop-plugin/ajuan-psd/fit.js') as {
  fitContain: (
    oldBounds: { left: number; top: number; right: number; bottom: number },
    newBounds: { left: number; top: number; right: number; bottom: number }
  ) => { scale: number; dx: number; dy: number }
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function png(width: number, height: number, colorType = 6): Buffer {
  const buf = Buffer.alloc(26)
  PNG_SIG.copy(buf)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  buf[24] = 8
  buf[25] = colorType
  return buf
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ajuan-psd-'))
  const paths: PsdPaths = { assetsDir: join(root, 'assets'), bridgeDir: join(root, 'bridge') }
  const psd = join(root, 'template.psd')
  writeFileSync(psd, Buffer.from('8BPS-original-content'))
  const dog = join(root, 'dog.png')
  const name = join(root, 'name.png')
  writeFileSync(dog, png(1254, 1254))
  writeFileSync(name, png(2172, 724))
  return {
    root,
    paths,
    psd,
    dog,
    name,
    db: testDb(),
    cleanup: () => {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

const roots: { cleanup: () => void }[] = []
afterEach(() => {
  while (roots.length) roots.pop()!.cleanup()
})

function useFixture() {
  const fx = fixture()
  roots.push(fx)
  return fx
}

function boardOf(fx: ReturnType<typeof fixture>) {
  return getPsdBoard(fx.db, fx.paths, { photoshopPath: null, pluginDir: '/plugin' })
}

function seed(fx: ReturnType<typeof fixture>, slots = ['slot_01']) {
  const templateId = createPsdTemplate(fx.db, { name: '六宫格', sourcePath: fx.psd })
  const slotIds = slots.map((slotKey) =>
    addPsdSlot(fx.db, {
      templateId,
      slotKey,
      dogLayer: `${slotKey}_dog`,
      nameLayer: `${slotKey}_name`
    })
  )
  const dogId = importPsdAsset(fx.db, fx.paths, 'dog', fx.dog)
  const nameId = importPsdAsset(fx.db, fx.paths, 'name', fx.name)
  return { templateId, slotIds, dogId, nameId }
}

describe('缩放回原边界', () => {
  it('相同边界不缩放也不移动', () => {
    expect(
      fitContain({ left: 0, top: 0, right: 100, bottom: 100 }, { left: 0, top: 0, right: 100, bottom: 100 })
    ).toEqual({
      scale: 1,
      dx: 0,
      dy: 0
    })
  })

  it('三种狗图尺寸和扁长名字图都按短边装入并回到原中心', () => {
    const slot = { left: 0, top: 0, right: 1000, bottom: 1000 }
    expect(fitContain(slot, { left: 0, top: 0, right: 500, bottom: 500 }).scale).toBe(2)
    expect(fitContain(slot, { left: 0, top: 0, right: 2000, bottom: 2000 }).scale).toBe(0.5)
    expect(fitContain(slot, { left: 0, top: 0, right: 2000, bottom: 500 }).scale).toBe(0.5)
    const nameSlot = { left: 10, top: 20, right: 810, bottom: 220 }
    const nameImage = { left: 0, top: 0, right: 2172, bottom: 724 }
    const fit = fitContain(nameSlot, nameImage)
    expect(fit.scale).toBeCloseTo(200 / 724)
    expect(fit.dx).toBeCloseTo(410 - 1086)
    expect(fit.dy).toBeCloseTo(120 - 362)
  })

  it('边界无效时不能缩放', () => {
    expect(() =>
      fitContain({ left: 0, top: 0, right: 0, bottom: 10 }, { left: 0, top: 0, right: 10, bottom: 10 })
    ).toThrow('图层边界无效')
  })
})

describe('任务文件名', () => {
  it('去掉路径字符，重名追加序号', () => {
    expect(safeOutputBase('a/b:c')).toBe('a b c')
    expect(allocateOutputName('张三', ['张三.psd'])).toBe('张三-2.psd')
    expect(allocateOutputName('张三', [])).toBe('张三.psd')
  })

  it('拒绝带路径的任务文件', () => {
    expect(() =>
      parseJobFile({
        version: 1,
        id: 1,
        title: '张三',
        templateFile: 'template.psd',
        outputFile: '../out.psd',
        replacements: [{ layerName: 'slot_01_dog', file: 'slot_01_dog.png' }]
      })
    ).toThrow('任务文件无效')
  })
})

describe('PSD 任务', () => {
  it('生成任务不改原始 PSD，也不把原始路径写进任务', () => {
    const fx = useFixture()
    const before = readFileSync(fx.psd)
    const mtime = statSync(fx.psd).mtimeMs
    const seeded = seed(fx)
    const jobId = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '张三',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    expect(readFileSync(fx.psd).equals(before)).toBe(true)
    expect(statSync(fx.psd).mtimeMs).toBe(mtime)
    const spec = parseJobFile(JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `${jobId}.json`), 'utf8')))
    expect(spec.templateFile).toBe('template.psd')
    expect(spec.outputFile).toBe('张三.psd')
    expect(JSON.stringify(spec)).not.toContain(fx.psd)
    expect(spec.replacements.map((item) => item.layerName)).toEqual(['slot_01_dog', 'slot_01_name'])
    const staged = readFileSync(join(fx.paths.bridgeDir, 'staging', String(jobId), 'template.psd'))
    expect(staged.equals(before)).toBe(true)
    expect(join(fx.paths.bridgeDir, 'staging', String(jobId), 'template.psd')).not.toBe(fx.psd)
    const view = boardOf(fx).jobs.find((job) => job.id === jobId)
    expect(view?.status).toBe('queued')
    expect(view?.outputPath).toBeNull()
  })

  it('一次任务可以替换多个位置，重名输出追加序号', () => {
    const fx = useFixture()
    const seeded = seed(fx, ['slot_01', 'slot_02'])
    const first = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '客户',
      items: [
        { slotId: seeded.slotIds[1], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId },
        { slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }
      ]
    })
    const second = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '客户',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    const firstSpec = parseJobFile(JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `${first}.json`), 'utf8')))
    const secondSpec = parseJobFile(
      JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `${second}.json`), 'utf8'))
    )
    expect(firstSpec.replacements.map((item) => item.file)).toEqual([
      'slot_01_dog.png',
      'slot_01_name.png',
      'slot_02_dog.png',
      'slot_02_name.png'
    ])
    expect(secondSpec.outputFile).toBe('客户-2.psd')
    expect(readFileSync(fx.psd).toString()).toBe('8BPS-original-content')
  })

  it('同步插件的成功、缺图层和锁定结果，原文件仍不变', () => {
    const fx = useFixture()
    const before = readFileSync(fx.psd)
    const seeded = seed(fx)
    const missing = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '缺图层',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    const locked = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '锁定',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    const done = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '完成',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    finishLikePlugin(fx, missing, { ok: false, replaced: [], error: '图层不存在: slot_02_dog', outputFile: null })
    finishLikePlugin(fx, locked, { ok: false, replaced: [], error: '图层已锁定: slot_01_dog', outputFile: null })
    const outputFile = '完成.psd'
    writeFileSync(join(fx.paths.bridgeDir, 'outputs', outputFile), Buffer.from('8BPS-output'))
    finishLikePlugin(fx, done, { ok: true, replaced: ['slot_01_dog', 'slot_01_name'], error: null, outputFile })
    const jobs = boardOf(fx).jobs
    expect(jobs.find((job) => job.id === missing)?.error).toBe('图层不存在: slot_02_dog')
    expect(jobs.find((job) => job.id === locked)?.error).toBe('图层已锁定: slot_01_dog')
    const exported = jobs.find((job) => job.id === done)
    expect(exported?.status).toBe('done')
    expect(exported?.outputPath).toBe(join(fx.paths.bridgeDir, 'outputs', outputFile))
    expect(existsSync(join(fx.paths.bridgeDir, 'staging', String(done)))).toBe(false)
    expect(existsSync(join(fx.paths.bridgeDir, 'staging', String(missing)))).toBe(true)
    expect(readFileSync(fx.psd).equals(before)).toBe(true)
    retryPsdJob(fx.db, fx.paths, missing)
    expect(existsSync(join(fx.paths.bridgeDir, 'inbox', `${missing}.json`))).toBe(true)
    expect(boardOf(fx).jobs.find((job) => job.id === missing)?.status).toBe('queued')
  })

  it('处理中的任务不能取消，放回队列后可以取消', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    const jobId = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '进行中',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    mkdirSync(join(fx.paths.bridgeDir, 'processing'), { recursive: true })
    renameSync(
      join(fx.paths.bridgeDir, 'inbox', `${jobId}.json`),
      join(fx.paths.bridgeDir, 'processing', `${jobId}.json`)
    )
    expect(boardOf(fx).jobs[0]?.status).toBe('running')
    expect(() => cancelPsdJob(fx.db, fx.paths, jobId)).toThrow(ServiceError)
    expect(requeueStuckPsdJobs(fx.db, fx.paths)).toBe(1)
    cancelPsdJob(fx.db, fx.paths, jobId)
    expect(boardOf(fx).jobs[0]?.status).toBe('cancelled')
    expect(existsSync(join(fx.paths.bridgeDir, 'inbox', `${jobId}.json`))).toBe(false)
    expect(existsSync(join(fx.paths.bridgeDir, 'staging', String(jobId)))).toBe(false)
  })

  it('等待中的素材和重复图层不能删改，无透明通道会记下来', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    writeFileSync(join(fx.root, 'flat.png'), png(800, 200, 2))
    const flatId = importPsdAsset(fx.db, fx.paths, 'name', join(fx.root, 'flat.png'))
    expect(boardOf(fx).assets.find((asset) => asset.id === flatId)?.hasAlpha).toBe(false)
    createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '占用',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    expect(() => deletePsdAsset(fx.db, fx.paths, seeded.dogId)).toThrow('等待中的导出任务')
    expect(() =>
      addPsdSlot(fx.db, {
        templateId: seeded.templateId,
        slotKey: 'slot_02',
        dogLayer: 'slot_01_name',
        nameLayer: 'slot_02_name'
      })
    ).toThrow('图层名已经用在别的位置上')
    writeFileSync(join(fx.root, 'note.jpg'), Buffer.from('not a png'))
    expect(() => importPsdAsset(fx.db, fx.paths, 'dog', join(fx.root, 'note.jpg'))).toThrow('只支持 PNG')
  })

  it('完成后可以删除模板，历史任务仍留着模板名', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    const jobId = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '归档',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    writeFileSync(join(fx.paths.bridgeDir, 'outputs', '归档.psd'), Buffer.from('8BPS-output'))
    finishLikePlugin(fx, jobId, { ok: true, replaced: ['slot_01_dog'], error: null, outputFile: '归档.psd' })
    expect(boardOf(fx).jobs[0]?.status).toBe('done')
    deletePsdTemplate(fx.db, seeded.templateId)
    const job = boardOf(fx).jobs[0]
    expect(job?.templateId).toBeNull()
    expect(job?.templateName).toBe('六宫格')
    expect(boardOf(fx).templates).toHaveLength(0)
  })

  it('桥接目录里的文件不能当作模板', () => {
    const fx = useFixture()
    const inside = join(fx.paths.bridgeDir, 'local.psd')
    mkdirSync(fx.paths.bridgeDir, { recursive: true })
    writeFileSync(inside, Buffer.from('8BPS-inside'))
    const templateId = createPsdTemplate(fx.db, { name: '内部', sourcePath: inside })
    const slotId = addPsdSlot(fx.db, {
      templateId,
      slotKey: 'slot_01',
      dogLayer: 'slot_01_dog',
      nameLayer: 'slot_01_name'
    })
    const dogId = importPsdAsset(fx.db, fx.paths, 'dog', fx.dog)
    const nameId = importPsdAsset(fx.db, fx.paths, 'name', fx.name)
    expect(() =>
      createPsdJob(fx.db, fx.paths, {
        templateId,
        title: '不行',
        items: [{ slotId, dogAssetId: dogId, nameAssetId: nameId }]
      })
    ).toThrow('桥接目录以外')
  })
})

describe('Photoshop 安装位置', () => {
  it('找不到时返回空，找得到时取版本名较新的一个', () => {
    const fx = useFixture()
    expect(findPhotoshopApp([join(fx.root, 'missing')])).toBeNull()
    const older = join(fx.root, 'Adobe Photoshop 2024.app')
    const newer = join(fx.root, 'Adobe Photoshop 2025', 'Photoshop.exe')
    mkdirSync(older)
    mkdirSync(join(fx.root, 'Adobe Photoshop 2025'))
    writeFileSync(newer, '')
    expect(findPhotoshopApp([fx.root])).toBe(newer)
  })
})

describe('插件约定', () => {
  it('另存副本、不写回打开的文件，并带上缺图层和锁的错误', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../photoshop-plugin/ajuan-psd/index.js'),
      'utf8'
    )
    expect(source).toContain('placedLayerReplaceContents')
    expect(source).toContain('saveAs.psd')
    expect(source).toContain('DONOTSAVECHANGES')
    expect(source).toContain('图层不存在:')
    expect(source).toContain('图层已锁定:')
    expect(source).toContain('图层不是智能对象:')
    expect(source).toContain('打开了错误文件:')
    expect(source).not.toMatch(/doc\.save\(/)
  })
})

function finishLikePlugin(
  fx: ReturnType<typeof fixture>,
  jobId: number,
  result: { ok: boolean; replaced: string[]; error: string | null; outputFile: string | null }
): void {
  const inbox = join(fx.paths.bridgeDir, 'inbox', `${jobId}.json`)
  const spec = parseJobFile(JSON.parse(readFileSync(inbox, 'utf8')))
  const folder = result.ok ? 'done' : 'failed'
  writeFileSync(join(fx.paths.bridgeDir, folder, `${jobId}.json`), JSON.stringify({ ...spec, result }, null, 2))
  rmSync(inbox)
}
